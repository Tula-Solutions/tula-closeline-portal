/**
 * Vendors the hub's merged public OpenAPI document (`public-openapi.json`) into
 * `openapi/public.openapi.json`, which the developer page renders. The page never fetches it.
 *
 *   bun run vendor:public -- --from ../tula-closeline [--ref origin/develop]   refresh the copy and its commit
 *   bun run vendor:public -- --check [--from ../tula-closeline [--ref origin/develop]]
 *                                                    fail if the copy is not an OpenAPI 3.1 document with a
 *                                                    commit hash, or (with --from) differs from the hub's
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const checking = args.includes('--check')
const from = option('--from')
const ref = option('--ref') ?? 'origin/develop'
const SPEC = new URL('../openapi/public.openapi.json', import.meta.url)
const COMMIT = new URL('../openapi/public.commit', import.meta.url)

function git(directory: string, ...gitArgs: string[]): string {
  const result = spawnSync('git', ['-C', directory, ...gitArgs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    console.error(`error: git ${gitArgs.join(' ')} failed: ${result.stderr.trim()}`)
    process.exit(1)
  }
  return result.stdout
}

const failures: string[] = []
if (from !== undefined) {
  const directory = resolve(from)
  const text = git(directory, 'show', `${ref}:public-openapi.json`)
  const hash = `${git(directory, 'rev-parse', ref).trim()}\n`
  JSON.parse(text)
  if (checking) {
    if (readFileSync(SPEC, 'utf8') !== text) {
      failures.push(`openapi/public.openapi.json differs from ${ref} of ${directory}.`)
    }
  } else {
    writeFileSync(SPEC, text)
    writeFileSync(COMMIT, hash)
  }
}
if (checking) {
  try {
    const document = JSON.parse(readFileSync(SPEC, 'utf8')) as { openapi?: string; paths?: object }
    if (!document.openapi?.startsWith('3.1') || document.paths === undefined) {
      failures.push('openapi/public.openapi.json is not an OpenAPI 3.1 document with paths.')
    }
    if (!/^[0-9a-f]{40}$/.test(readFileSync(COMMIT, 'utf8').trim())) {
      failures.push('openapi/public.commit is missing or malformed.')
    }
  } catch {
    failures.push('openapi/public.openapi.json or openapi/public.commit is missing or malformed.')
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
}
