import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..')
const AUTH_SPEC = readFileSync(join(REPO, 'openapi/auth.openapi.json'), 'utf8')
const CORE_SPEC = readFileSync(join(REPO, 'openapi/core.openapi.json'), 'utf8')

// A fixed date makes the same content the same commit, so a rebuilt clone stays in sync.
const FIXED = '2026-01-01T00:00:00Z'

function git(directory: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: FIXED, GIT_COMMITTER_DATE: FIXED },
  })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout.trim()
}

/** Makes a scratch repository whose `origin/develop` holds `openapi.json`; returns its commit. */
function fakeService(directory: string, spec: string | null, note?: string): string {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  git(directory, 'init', '-q')
  git(directory, 'config', 'user.email', 'test@example.com')
  git(directory, 'config', 'user.name', 'Test')
  if (spec !== null) {
    writeFileSync(join(directory, 'openapi.json'), spec)
  } else {
    writeFileSync(join(directory, 'README.md'), 'no spec')
  }
  if (note !== undefined) {
    writeFileSync(join(directory, 'NOTES.md'), note)
  }
  git(directory, 'add', '-A')
  git(directory, 'commit', '-q', '-m', 'init')
  const hash = git(directory, 'rev-parse', 'HEAD')
  git(directory, 'update-ref', 'refs/remotes/origin/develop', hash)
  return hash
}

let work: string
let root: string
let siblings: string

async function run(...args: string[]) {
  const child = Bun.spawn(
    [
      'bun',
      join(REPO, 'scripts/generate-api.ts'),
      '--root',
      root,
      '--siblings-dir',
      siblings,
      ...args,
    ],
    { cwd: REPO, stdout: 'pipe', stderr: 'pipe' }
  )
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code, output: `${out}${err}` }
}

/** Puts the core clone back to `spec` on its origin/develop. */
function resetCore(spec: string | null = CORE_SPEC, note?: string) {
  fakeService(join(siblings, 'tula-closeline-core'), spec, note)
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'spec-drift-'))
  root = join(work, 'portal')
  siblings = join(work, 'siblings')
  mkdirSync(join(root, 'src/api'), { recursive: true })
  cpSync(join(REPO, 'openapi'), join(root, 'openapi'), { recursive: true })
  writeFileSync(join(root, 'src/api/auth.gen.ts'), '')
  mkdirSync(siblings, { recursive: true })
  fakeService(join(siblings, 'tula-closeline-auth'), AUTH_SPEC)
  resetCore()
  // Vendor the copies from the fakes, then write the types for them: the shared in-sync state.
  await run('--from', join(siblings, 'tula-closeline-auth'), '--ref', 'origin/develop')
  await run('--core-from', join(siblings, 'tula-closeline-core'), '--core-ref', 'origin/develop')
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('generate-api --check --siblings', () => {
  test('in sync: prints ok for each spec and exits 0', async () => {
    resetCore()
    const result = await run('--check', '--siblings')
    expect(result.output).toContain('ok: core @')
    expect(result.output).toContain('ok: auth @')
    expect(result.code).toBe(0)
  })

  test('a core clone with an extra path fails and names the vendored core copy', async () => {
    resetCore()
    const changed = JSON.parse(CORE_SPEC) as { paths: Record<string, unknown> }
    changed.paths['/v1/brand-new'] = { get: { responses: { '200': { description: 'ok' } } } }
    resetCore(JSON.stringify(changed, null, 2))
    const result = await run('--check', '--siblings')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('openapi/core.openapi.json')
  })

  test('a missing clone is skipped with a message and exits 0', async () => {
    resetCore()
    rmSync(join(siblings, 'tula-closeline-core'), { recursive: true })
    const result = await run('--check', '--siblings')
    expect(result.output).toContain('skipped: no core clone')
    expect(result.output).toContain('ok: auth @')
    expect(result.code).toBe(0)
  })

  test('--siblings without --check is refused and changes no file', async () => {
    resetCore()
    const before = readFileSync(join(root, 'openapi/core.openapi.json'), 'utf8')
    const result = await run('--siblings')
    expect(result.code).toBe(1)
    expect(result.output).toContain('--siblings only works with --check')
    expect(readFileSync(join(root, 'openapi/core.openapi.json'), 'utf8')).toBe(before)
  })

  test('a clone without openapi.json on origin/develop is one error line and exit 1', async () => {
    resetCore()
    resetCore(null)
    const result = await run('--check', '--siblings')
    expect(result.code).toBe(1)
    expect(result.output).toContain('error: core clone has no origin/develop:openapi.json\n')
  })

  test('identical content with a different commit passes and says only the commit differs', async () => {
    resetCore(CORE_SPEC, 'a change that does not touch openapi.json')
    const result = await run('--check', '--siblings')
    expect(result.code).toBe(0)
    expect(result.output).toContain('info: core matches')
    expect(result.output).toContain('only the recorded commit differs')
    expect(result.output).toContain('ok: auth @')
  })

  test('different content with a different commit fails and names the core copy', async () => {
    const changed = JSON.parse(CORE_SPEC) as { paths: Record<string, unknown> }
    changed.paths['/v1/another-new'] = { get: { responses: { '200': { description: 'ok' } } } }
    resetCore(JSON.stringify(changed, null, 2), 'and a new commit')
    const result = await run('--check', '--siblings')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('openapi/core.openapi.json')
  })

  test('--strict-hash fails on the commit alone', async () => {
    resetCore(CORE_SPEC, 'a change that does not touch openapi.json')
    const result = await run('--check', '--siblings', '--strict-hash')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('openapi/core.openapi.json')
  })
})
