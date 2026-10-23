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
| `/v1/playbook` | playbook |

Nothing under `/internal` is forwarded. `/healthz` and `/readyz` exist on both services, so they are
not routed; probe a service on its own port. Where the services listen comes from three dev-server
settings, not `VITE_*` (see `.env.example`): `AUTH_PROXY_TARGET` (default `http://127.0.0.1:3001`),
`CORE_PROXY_TARGET` (default `http://127.0.0.1:3002`) and `PLAYBOOK_PROXY_TARGET` (default `http://127.0.0.1:3003`).
The dev server answers 403 to a Host header it does not know; `PORTAL_DEV_ALLOWED_HOSTS` adds hosts (for
example a tunnel) as a comma-separated list of exact hosts. Unset keeps Vite's default; `true`, `*` and
wildcard or suffix entries are refused.

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

`openapi/core.openapi.json` (with `openapi/core.commit`) is core's document, and
`openapi/playbook.openapi.json` (with `openapi/playbook.commit`) the playbook service's, each vendored
the same way but only for its paths: the routing-table test reads them, so a new core or playbook
route fails `bun run verify` until its prefix is in `src/api/service-routes.ts`. Refresh each from the
service's `develop`, not a working tree. The playbook client (`src/api/playbook.ts`) is typed by the
contract's schemas, not generated.

```bash
bun run generate:api -- --from ../tula-closeline-auth --ref origin/develop   # refresh copy, hash and types
bun run generate:api                                                          # types from the committed copy
bun run generate:api -- --core-from ../tula-closeline-core --core-ref origin/develop   # refresh core's copy
bun run generate:api -- --check --core-from ../tula-closeline-core --core-ref origin/develop   # drift against core
bun run generate:api -- --playbook-from ../tula-closeline-playbook --playbook-ref origin/develop   # refresh playbook's copy
```

`bun run spec:check` runs `--check` and also compares both copies with `origin/develop` of the
sibling clones `../tula-closeline-auth`, `../tula-closeline-core` and `../tula-closeline-playbook`; a
clone that is not present is skipped with a message. A copy whose content matches but whose recorded commit differs passes with an `info:` line;
`--strict-hash` fails on that too. Each comparison prints `ok:` with the
clone's last fetch time: without `--fetch` it is against that last fetch, and `bun run spec:check --fetch` first runs `git fetch origin develop` in each clone. The scheduled hub workflow and the
service PR-template line from hub issue 44 are not done here. CI has no sibling clones, so CI does not catch a
service moving on: run `spec:check` before opening a portal PR, and re-vendor when a service adds a
public path. `verify` fails when the generated types are stale. `src/routeTree.gen.ts` (TanStack Router) is
regenerated by `bun run routes:generate` and by the dev server and build.

## Playbook documents

The Playbook screen (`/playbook`, in the navigation for every role) lists documents from
`/v1/playbook/documents`. **Infra must route `/v1/playbook` to the playbook service, unchanged, on
the portal's origin, like the other prefixes.** Owners and Admins upload (file picker or drag and
drop), delete and restore; Managers and Reps read. Uploads are checked in the browser with the
contract's `checkUploadFile` and limits, then sent one at a time as multipart with an
`Idempotency-Key` kept in the app's key map until the outcome is known. `fetch` gives no upload
progress, so a file shows "Uploading" until the service answers. Documents still `uploaded` or
`processing` are asked about again after a growing wait (2 s up to 30 s, about ten minutes in all),
never while the tab is hidden, and never once nothing is pending. The service returns no uploader
name (only a user id), so the list does not show who uploaded a file: that needs a contract field
(joining to the members list is unsound, since it pages, members leave, and Managers and Reps
may not read it). A document with a state, media type or failure reason this build's contract does
not know fails the whole page by design (the strict parse is house behaviour) until the contract
tag is bumped; the label helpers still have safe defaults so a widened schema never renders
`undefined`.

## Sales history

`/sales-history` (navigation for Owners and Admins only; a Manager or Rep who opens it sees a notice and
nothing is requested) holds Deals, Deal imports and the rights confirmation, against contract v0.8.0 and
`/v1/playbook/rights-confirmation`, `/deals`, `/deals/lookup` and `/deal-imports`. A Deal is found by the
customer's deal id through `POST /deals/lookup` (the id is in the body, never an address, log or Sentry
event) and opens at `/sales-history/deals/deal_…`. An import is a CSV checked in the browser (extension,
size, the contract's header check) then sent as multipart with an `Idempotency-Key`; its report lists every
row with the reason in words and can be downloaded as CSV with formula-looking cells made safe. The rights
confirmation wording is the contract's (`RIGHTS_WORDINGS`, contract v0.9.0): the screen shows the text of the
version it will send, marked as a draft while the contract says so (pending a lawyer's check).

A Deal's `closedAt` is a calendar date `YYYY-MM-DD` (contract v0.11.0): it is shown as that date (`formatDateOnly`,
built from its own year, month and day, never `new Date('YYYY-MM-DD')` in local time) and the Outcome form sends
it from a date input. A speaker's excerpt on a Recording waiting for its Rep comes from reading that one Call
(`GET /calls/{id}`) when the picker opens, and is shown as text.

Calls (`/sales-history/calls`) are uploaded as a Transcript (the file, the customer's deal id and the Rep's
speaker label) or a Recording (the deal id, an optional Rep channel, then the file last; up to 500 MB, with a
progress bar and Cancel, sent with XMLHttpRequest because `fetch` has no upload progress; the File is streamed
by the browser, never read). The Recording's client timeout is 30 minutes, the same as the service's
`RECORDING_BODY_TIMEOUT_MS`, so a 500 MB Recording needs about 2.2 Mbps of upload (500 MB x 8 / 1800 s);
a slower line times out and the person can retry. Both go in the multipart body with an `Idempotency-Key`. If the
rights wording is not confirmed, the chosen file and fields are held in memory (never in storage or an
address) while the person confirms on the rights page, then restored. Each Call shows its state, why it is
or is not in search, the fix the contract names for a failure, and offers Change Rep (from the Call's own
speaker labels, disabled where the contract refuses), delete and restore. The uploader is not shown (the
service returns only a user id). The Calls list reads each Call on its own, so one with a state this build does not know becomes a placeholder row instead of failing the page (reported once per page, status and code only).

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
