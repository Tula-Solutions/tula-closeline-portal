/**
 * Regenerates `src/api/auth.gen.ts` from the committed copy of the auth service's OpenAPI document.
 *
 *   bun run generate:api                                       rewrite the types from the committed copy
 *   bun run generate:api -- --check                            fail if the committed types are stale
 *   bun run generate:api -- --from ../tula-closeline-auth [--ref origin/develop]
 *                                                              first refresh the copy and the commit
 *                                                              hash from the auth checkout, then rewrite
 *   bun run generate:api -- --core-from ../tula-closeline-core [--core-ref origin/develop]
 *                                                              the same for core's OpenAPI document; only its
 *                                                              paths are used (the routing table's test), so no
 *                                                              types are generated from it
 *   bun run spec:check                                         --check, plus drift against origin/develop of the
 *                                                              sibling clones ../tula-closeline-auth and
 *                                                              ../tula-closeline-core; a missing clone is skipped
 *                                                              with a message (CI has none, so CI skips it)
 *   --fetch (with --siblings) first runs `git fetch origin develop` in each sibling; without it the
 *   comparison is against the clone's last fetch.
 *   --strict-hash (with --check and a checkout) also fails when only the recorded commit differs; by
 *   default a copy whose content matches the checkout passes and a differing commit is printed as info.
 *   --check also fails if the committed core copy is not a valid document with a commit hash, and with
 *   --from / --core-from it fails if the committed copy differs from that ref of the checkout.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// openapi-typescript drives the JavaScript compiler API, which TypeScript 7 (the native compiler
// that `tsc` is here) does not ship. Load its modules with their `typescript` import pointed at
// the TypeScript 6 package instead.
Bun.plugin({
  name: 'typescript-api',
  setup(build) {
    build.onLoad({ filter: /openapi-typescript\/dist\/.*\.mjs$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replaceAll(
        /from ["']typescript["']/g,
        'from "@typescript/typescript6"'
      ),
      loader: 'js',
    }))
  },
})
const { default: openapiTS, astToString } = await import('openapi-typescript')

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

// --root <dir> points the script at another portal tree (the script's own tests use it).
const rootOption = option('--root')
const ROOT =
  rootOption === undefined
    ? new URL('../', import.meta.url)
    : pathToFileURL(`${resolve(rootOption)}/`)
const SPEC = new URL('openapi/auth.openapi.json', ROOT)
const COMMIT = new URL('openapi/auth.commit', ROOT)
const OUTPUT = new URL('src/api/auth.gen.ts', ROOT)
const CORE_SPEC = new URL('openapi/core.openapi.json', ROOT)
const CORE_COMMIT = new URL('openapi/core.commit', ROOT)

function git(directory: string, args: readonly string[]): string {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout
}

const checking = process.argv.includes('--check')
const strictHash = process.argv.includes('--strict-hash')
const failures: string[] = []

/** When the clone's remote-tracking ref last moved (its reflog), else its last fetch, else unknown. */
function fetchTime(directory: string, ref: string): string {
  try {
    const logged = git(directory, ['log', '-g', '-1', '--format=%cI', `refs/remotes/${ref}`]).trim()
    if (logged !== '') {
      return logged
    }
    const file = git(directory, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'FETCH_HEAD',
    ]).trim()
    return statSync(file).mtime.toISOString()
  } catch {
    return 'fetch time unknown'
  }
}

/** Refreshes (or, with --check, compares) one vendored copy and its commit hash from a checkout. */
function vendor(directory: string, ref: string, spec: URL, commit: URL, name: string): void {
  let text: string
  let hash: string
  try {
    text = git(directory, ['show', `${ref}:openapi.json`])
    hash = `${git(directory, ['rev-parse', ref]).trim()}\n`
  } catch {
    console.error(`error: ${name} clone has no ${ref}:openapi.json`)
    process.exit(1)
  }
  JSON.parse(text)
  if (checking) {
    const recorded = readFileSync(commit, 'utf8')
    const fix = `run \`bun run generate:api\` with the matching flag and commit the result.`
    if (readFileSync(spec, 'utf8') !== text) {
      failures.push(`openapi/${name}.openapi.json differs from ${ref} of ${directory}: ${fix}`)
    } else if (recorded !== hash) {
      const note = `openapi/${name}.openapi.json matches ${ref} of ${directory}; only the recorded commit differs (recorded ${recorded.trim()}, ${ref} is ${hash.trim()})`
      if (strictHash) {
        failures.push(`${note}: ${fix}`)
      } else {
        console.log(
          `info: ${name} matches ${ref}; only the recorded commit differs (recorded ${recorded.trim()}, ${ref} is ${hash.trim()}). Not a failure; --strict-hash fails on it.`
        )
      }
    } else {
      const as = ref.startsWith('origin/') ? `${ref} as last fetched` : ref
      console.log(`ok: ${name} @ ${hash.slice(0, 7)} (${as}, ${fetchTime(directory, ref)})`)
    }
    return
  }
  writeFileSync(spec, text)
  writeFileSync(commit, hash)
}

const siblings = process.argv.includes('--siblings')
if (siblings && !checking) {
  console.error('error: --siblings only works with --check')
  process.exit(1)
}
const fetching = process.argv.includes('--fetch')
let from = option('--from')
let coreFrom = option('--core-from')
if (siblings) {
  const sibling = (short: string): string | undefined => {
    const base = option('--siblings-dir') ?? new URL('../', ROOT).pathname
    const path = resolve(base, `tula-closeline-${short}`)
    if (existsSync(path)) {
      if (fetching) {
        try {
          git(path, ['fetch', 'origin', 'develop'])
        } catch {
          console.error(`error: could not fetch origin develop in the ${short} clone`)
          process.exit(1)
        }
      }
      return path
    }
    console.log(
      `skipped: no ${short} clone at ${path}, so openapi/${short}.openapi.json is not compared with its service.`
    )
    return undefined
  }
  from ??= sibling('auth')
  coreFrom ??= sibling('core')
}
const defaultRef = siblings ? 'origin/develop' : 'HEAD'
if (from !== undefined) {
  vendor(from, option('--ref') ?? defaultRef, SPEC, COMMIT, 'auth')
}
if (coreFrom !== undefined) {
  vendor(coreFrom, option('--core-ref') ?? defaultRef, CORE_SPEC, CORE_COMMIT, 'core')
}
if (checking) {
  const core = JSON.parse(readFileSync(CORE_SPEC, 'utf8')) as { paths?: Record<string, unknown> }
  if (
    core.paths === undefined ||
    !/^[0-9a-f]{40}$/.test(readFileSync(CORE_COMMIT, 'utf8').trim())
  ) {
    failures.push('openapi/core.openapi.json or openapi/core.commit is missing or malformed.')
  }
}

const commit = readFileSync(COMMIT, 'utf8').trim()
const document = JSON.parse(readFileSync(SPEC, 'utf8')) as Record<string, unknown>
const types = astToString(await openapiTS(document as never))
const banner = [
  '// GENERATED by scripts/generate-api.ts from openapi/auth.openapi.json. Never edit by hand;',
  '// run `bun run generate:api`.',
  `// Source: tula-closeline-auth @ ${commit}`,
  '',
].join('\n')
const output = `${banner}${types}`

if (checking) {
  if (readFileSync(OUTPUT, 'utf8') !== output) {
    failures.push('src/api/auth.gen.ts is stale: run `bun run generate:api` and commit the result.')
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
} else {
  writeFileSync(OUTPUT, output)
}
