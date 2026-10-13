import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..', '..')
const AUTH_SPEC = readFileSync(join(REPO, 'openapi/auth.openapi.json'), 'utf8')
const CORE_SPEC = readFileSync(join(REPO, 'openapi/core.openapi.json'), 'utf8')

function git(directory: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout.trim()
}

/** Makes a scratch repository whose `origin/develop` holds `openapi.json`; returns its commit. */
function fakeService(directory: string, spec: string | null): string {
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
  git(directory, 'add', '-A')
  git(directory, 'commit', '-q', '-m', 'init')
  const hash = git(directory, 'rev-parse', 'HEAD')
  git(directory, 'update-ref', 'refs/remotes/origin/develop', hash)
  return hash
}

let work: string
let root: string
let siblings: string

function run(...args: string[]) {
  const result = spawnSync(
    'bun',
    [join(REPO, 'scripts/generate-api.ts'), '--root', root, '--siblings-dir', siblings, ...args],
    { encoding: 'utf8', cwd: REPO }
  )
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

function reset(core: string | null, auth: string | null = AUTH_SPEC) {
  rmSync(siblings, { recursive: true, force: true })
  mkdirSync(siblings, { recursive: true })
  const authHash = auth === null ? null : fakeService(join(siblings, 'tula-closeline-auth'), auth)
  const coreHash = core === null ? null : fakeService(join(siblings, 'tula-closeline-core'), core)
  // Vendor the copies from the fakes, then regenerate the types from them.
  if (authHash !== null && coreHash !== null) {
    run('--from', join(siblings, 'tula-closeline-auth'), '--ref', 'origin/develop')
    run('--core-from', join(siblings, 'tula-closeline-core'), '--core-ref', 'origin/develop')
  }
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'spec-drift-'))
  root = join(work, 'portal')
  siblings = join(work, 'siblings')
  mkdirSync(join(root, 'src/api'), { recursive: true })
  cpSync(join(REPO, 'openapi'), join(root, 'openapi'), { recursive: true })
  writeFileSync(join(root, 'src/api/auth.gen.ts'), '')
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('generate-api --check --siblings', () => {
  test('in sync: prints ok for each spec and exits 0', () => {
    reset(CORE_SPEC)
    expect(run().code).toBe(0) // writes the types for the fake auth commit
    const result = run('--check', '--siblings')
    expect(result.output).toContain('ok: core @')
    expect(result.output).toContain('ok: auth @')
    expect(result.code).toBe(0)
  })

  test('a core clone with an extra path fails and names the vendored core copy', () => {
    reset(CORE_SPEC)
    run()
    const changed = JSON.parse(CORE_SPEC) as { paths: Record<string, unknown> }
    changed.paths['/v1/brand-new'] = { get: { responses: { '200': { description: 'ok' } } } }
    fakeService(join(siblings, 'tula-closeline-core'), JSON.stringify(changed, null, 2))
    const result = run('--check', '--siblings')
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('openapi/core.openapi.json')
  })

  test('a missing clone is skipped with a message and exits 0', () => {
    reset(CORE_SPEC)
    run()
    rmSync(join(siblings, 'tula-closeline-core'), { recursive: true })
    const result = run('--check', '--siblings')
    expect(result.output).toContain('skipped: no core clone')
    expect(result.output).toContain('ok: auth @')
    expect(result.code).toBe(0)
  })

  test('--siblings without --check is refused and changes no file', () => {
    reset(CORE_SPEC)
    const before = readFileSync(join(root, 'openapi/core.openapi.json'), 'utf8')
    const result = run('--siblings')
    expect(result.code).toBe(1)
    expect(result.output).toContain('--siblings only works with --check')
    expect(readFileSync(join(root, 'openapi/core.openapi.json'), 'utf8')).toBe(before)
  })

  test('a clone without openapi.json on origin/develop is one error line and exit 1', () => {
    reset(CORE_SPEC)
    run()
    fakeService(join(siblings, 'tula-closeline-core'), null)
    const result = run('--check', '--siblings')
    expect(result.code).toBe(1)
    expect(result.output).toContain('error: core clone has no origin/develop:openapi.json\n')
  })
})
