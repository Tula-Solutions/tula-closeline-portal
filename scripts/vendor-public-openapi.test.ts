import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..')
const COPY = readFileSync(join(REPO, 'openapi/public.openapi.json'), 'utf8')

function git(directory: string, ...args: string[]): void {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
}

/** A scratch hub whose `origin/develop` holds `public-openapi.json`. */
function fakeHub(directory: string, document: string): void {
  git(directory, 'init', '-q')
  git(directory, 'config', 'user.email', 'test@example.com')
  git(directory, 'config', 'user.name', 'Test')
  writeFileSync(join(directory, 'public-openapi.json'), document)
  git(directory, 'add', '-A')
  git(directory, 'commit', '-q', '-m', 'init')
  git(directory, 'update-ref', 'refs/remotes/origin/develop', 'HEAD')
}

function check(...args: string[]) {
  return spawnSync('bun', [join(REPO, 'scripts/vendor-public-openapi.ts'), '--check', ...args], {
    encoding: 'utf8',
  })
}

let work: string
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'vendor-public-'))
})
afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('vendor-public-openapi --check', () => {
  test('passes for the committed copy', () => {
    expect(check().status).toBe(0)
  })

  test('passes when the hub holds the same document', () => {
    const hub = join(work, 'same')
    spawnSync('mkdir', ['-p', hub])
    fakeHub(hub, COPY)
    expect(check('--from', hub).status).toBe(0)
  })

  test('fails when the hub holds a different document', () => {
    const hub = join(work, 'different')
    spawnSync('mkdir', ['-p', hub])
    fakeHub(hub, `${JSON.stringify({ openapi: '3.1.0', paths: { '/v1/x': {} } })}\n`)
    const result = check('--from', hub)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs')
  })
})
