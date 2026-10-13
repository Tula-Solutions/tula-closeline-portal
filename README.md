# tula-closeline-portal

Closeline portal: the dashboard web app

Part of Closeline. The hub repo [`tula-closeline`](https://github.com/Tula-Solutions/tula-closeline)
holds the glossary, decision records, plans, issues and the shared workflow setup.

## Getting started

```bash
# Once per machine, if you have no SSH key on GitHub: fetch the private tula-closeline-*
# libraries over https with your gh login.
gh auth setup-git
git config --global url."https://github.com/Tula-Solutions/".insteadOf "ssh://git@github.com/Tula-Solutions/"

bun install
cp .env.example .env.local   # then edit; see Configuration
bun run dev                  # http://localhost:5173
bun run verify
```

Standards: `AGENTS.md` (this repo) and `.claude/COMMON.md` (shared).

## Configuration

Vite embeds every `VITE_*` value in the built files, so none may be a secret. The schema is
`src/env.ts`; a missing or malformed value stops the app at boot with a message naming it.

| Variable | Meaning |
| --- | --- |
| `VITE_ENVIRONMENT` | `local`, `dev`, `staging` or `prod`. Behaviour is gated on this, never on Vite's mode. |
| `VITE_SENTRY_DSN` | Required outside `local`; empty turns error reporting off. |
| `VITE_RELEASE` | The build's version, sent with error reports. |

### Local development: one origin

The browser calls only its own origin (ADR 0012). `bun run dev` serves the portal and proxies the
paths in `src/api/service-routes.ts` to the services, forwarding each path unchanged (the refresh
cookie's `Path` is `/v1/client/sessions/`) and leaving `Host` and `Origin` as the browser sent them:

| Prefix | Service |
| --- | --- |
| `/v1/client` | auth |
| `/v1/organization`, `/v1/members`, `/v1/invitations`, `/v1/teams` | core |

Nothing under `/internal` is forwarded. `/healthz` and `/readyz` exist on both services, so they are
not routed; probe a service on its own port. Where the services listen comes from two dev-server
settings, not `VITE_*` (see `.env.example`): `AUTH_PROXY_TARGET` (default `http://127.0.0.1:3001`) and
`CORE_PROXY_TARGET` (default `http://127.0.0.1:3002`).

Run auth with `SESSION_ALLOWED_ORIGINS` set to the portal's origin (`http://localhost:5173`) and, over
plain http, `SESSION_COOKIE_INSECURE=true` (the cookie is then named `tula_refresh`).
A reload restores the session by refreshing from that cookie.

## Build and host

`bun run build` writes the static site to `out/`. `bun run verify` builds with placeholder `local`
values into `out/verify/`.

The build sets a strict Content-Security-Policy in a `<meta>` tag (no `unsafe-inline`; scripts and
styles only from the site itself; `connect-src` limited to the site and the Sentry origin from
configuration) and writes the same policy, with `frame-ancestors 'none'` that a meta
tag ignores, and the other security headers to `out/_headers`. **The host must send those as real
response headers** (translate `_headers` for CloudFront or the host's own format). Browsers also need
the host to serve `index.html` for every path (single-page fallback). Source maps are built hidden:
upload them to Sentry, do not serve them.

A deployment serves the portal and both services on **one origin**, routing the prefixes above to
each service by path and unchanged (no prefix added or stripped). There is no CORS anywhere.

## The API client

`src/api/auth.gen.ts` is generated from `openapi/auth.openapi.json`, a copy of the auth service's
OpenAPI document, with the auth commit it came from in `openapi/auth.commit`. Never edit either by
hand.

`openapi/core.openapi.json` (with `openapi/core.commit`) is core's document, vendored the same way but only
for its paths: the routing-table test reads it, so a new core route fails `bun run verify` until its
prefix is in `src/api/service-routes.ts`. Refresh it from core's `develop`, not a working tree.

```bash
bun run generate:api -- --from ../tula-closeline-auth --ref origin/develop   # refresh copy, hash and types
bun run generate:api                                                          # types from the committed copy
bun run generate:api -- --core-from ../tula-closeline-core --core-ref origin/develop   # refresh core's copy
bun run generate:api -- --check --core-from ../tula-closeline-core --core-ref origin/develop   # drift against core
```

`bun run spec:check` runs `--check` and also compares both copies with `origin/develop` of the
sibling clones `../tula-closeline-auth` and `../tula-closeline-core`; a
clone that is not present is skipped with a message. A copy whose content matches but whose recorded commit differs passes with an `info:` line;
`--strict-hash` fails on that too. Each comparison prints `ok:` with the
clone's last fetch time: without `--fetch` it is against that last fetch, and `bun run spec:check --fetch` first runs `git fetch origin develop` in each clone. The scheduled hub workflow and the
service PR-template line from hub issue 44 are not done here. CI has no sibling clones, so CI does not catch a
service moving on: run `spec:check` before opening a portal PR, and re-vendor when a service adds a
public path. `verify` fails when the generated types are stale. `src/routeTree.gen.ts` (TanStack Router) is
regenerated by `bun run routes:generate` and by the dev server and build.

## Sessions

Every call to auth sends `x-tula-client: browser`, so auth sets the refresh token in an `HttpOnly`
cookie and returns only the access token, which the portal keeps in memory. On load the portal
refreshes once to restore the session; sign-out ends it in every tab. See `AGENTS.md`.

## Known gaps

- The session carries no user id, so a different user signing in to the same Organization in
  another tab is not detected until a sign-out or reload. A different Organization is detected
  and clears this tab's data and held idempotency keys.
  This is correct today: no cached query is user-specific. The three lists (members, Invitations,
  Teams) and the Organization record are per Organization, the same for any caller core lets read
  them, and the password policy is public (`src/data/query-keys.test.tsx` checks the keys on these
  screens). Add a clear on a change of user (which needs a user id in the session) together with
  the first user-specific query.
- Core serves no list of a Team's members, so the Team panel adds or removes a member chosen from
  the Organization's members.
- After a laptop sleep the monotonic clock may not advance, so the first call can go out with an
  expired token; a 401 then costs one refresh and one retry. One wasted request, accepted (see
  `AGENTS.md`).
- The query cache clears on sign-out and Organization change only, not when a different user signs
  in to the same Organization.

## Invitations

An Invitation email must link to `/sign-up#invitation=<token>`. The portal reads the fragment, keeps
the token in memory and removes it from the address bar at once.
