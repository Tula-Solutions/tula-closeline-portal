# tula-closeline-portal

Closeline portal: the dashboard web app

Kind: **bare**. Common standards for every Closeline repo are in `.claude/COMMON.md`, synced
from the hub (`tula-closeline`). This file holds only what is specific to this repo. Keep it under
200 lines: put detail in a path-scoped rule under `.claude/rules/` or a decision record in the hub.

## Commands

| Command | Use |
| --- | --- |
| `bun install` | install, including the tagged `tula-closeline-*` libraries |
| `bun run verify` | the full gate, exactly what CI runs |
| `bun run verify:changed` | the quick gate the Stop hook runs |
| `bun test` | tests |
| `bun run dev` / `bun run build` | dev server / static build into `out/` |
| `bun run generate:api` | regenerate the auth client types (see `README.md`) |
| `bun run spec:check` | compare the vendored specs with the sibling clones' `origin/develop` (skipped if absent) |

Other scripts are in `package.json`.

## Issues

All tickets live in the hub: `gh issue list -R Tula-Solutions/tula-closeline --label repo:portal`.

## Layout

Vite, React, TypeScript, TanStack Router (file routes in `src/routes/`, thin) and TanStack Query.
Styling is Tailwind 4 (`@tailwindcss/vite`) with the design tokens and the older hand-written classes in
`src/styles.css` (two colours, ink `#1A1A18` and paper `#F1EFE8`, tints by opacity). Primitives are shadcn
style: Radix, `class-variance-authority` for variants, `cn()` from `src/lib/utils.ts`, icons from
`lucide-react`. No inline `style` attributes (the Content-Security-Policy forbids them).

- `src/main.tsx` boots: parse env, start reporting, build the app, take the Invitation from the URL.
- `src/app.ts` is the one composition root (HTTP clients, session, query cache, reporter). Screens
  get it from `useApp()`; tests build it with a `fetch` double (`src/testing/`).
- `src/api/`: `http.ts` (same-origin paths only, timeout on every call, jittered retry for GETs
  only, `ApiError`), `errors.ts`, `auth.ts` / `core.ts` / `playbook.ts` (typed routes), `messages.ts` (an error
  code to plain words), `service-routes.ts` (the path-prefix table and the dev proxy), `auth.gen.ts`
  (generated).
- `src/session/session.ts` holds the access token and restores the session; `src/screens/SessionGate.tsx`
  is the pending / could-not-reach screen; `src/report/` is the only door to Sentry.
- `src/screens/` has the screens and their tests. There are two component folders. **`src/ui/` is the
  one new code uses** (`Field`, `Banner`, `Paged`, `Untrusted`, `useSubmit` and the other form and
  feedback pieces; about ten times more imports than the other). `src/components/ui/` holds the
  generated shadcn primitives (`button`, `input`, `select`, `alert`, ...): import one from there only
  when it is already the primitive you need, and wrap it in `src/ui/` when a screen needs more. Do not
  add new pieces to `src/components/ui/` by hand; a merge of the two folders is a separate change.
- The portal imports only `tula-closeline-contract`, never server code (ADR 0006). The UI branches
  on an error's `area.reason` code, never its status.

## Rules specific to this repo

- Assessments review (`/assessments`: Owner, Admin) is hidden from everyone else, in the nav and by a
  notice on the route that makes no request. Findings hold spans, never text: a Draft's sentence is
  fetched on demand and shown through `plain()`; a Call turn has no readable transcript route yet, so
  the entry says so. Feedback goes out with an Idempotency-Key from `app.keys`. The failure-rate
  chart is per Agent kind, with a second ledger table of weeks by kind of finding (`groupBy=category`);
  neither states a rate for a week or cell under 20 records.
- Audit log (`/audit`: Owner, Admin, Manager) and Data export (`/export`: Owner, Admin) are hidden from
  everyone else, in the nav and by a notice on the route. The audit screen shows ids, labels and
  actions, never the text of a Message. An export download link is requested on click, handed to
  `app.assign` and never stored, shown or logged.
- Browser sessions follow ADR 0012. Every call is a same-origin path (`/v1/...`) with
  `credentials: 'same-origin'`; no service URL is a setting, in code or in the bundle, and there is no
  CORS. Every call to auth sends `x-tula-client: browser`, so auth keeps the refresh token in an
  `HttpOnly` cookie and never in a body. **The refresh token does not exist in portal code.**
- The access token lives in memory only (the session closure): never `localStorage`,
  `sessionStorage`, IndexedDB, a cookie, a URL or anything serialised. `no-token-storage.test.ts`
  fails the build if source uses those or names a refresh token.
- On load, `main.tsx` calls `session.restore()` before the first render: `restoring` shows a pending
  screen (no sign-in flash), 401 is signed out, no answer, 429 or 5xx is `unreachable` with a retry, and any other 4xx (a 403 from auth's Origin
  check) is `misconfigured`: its own screen, no retry, one report (status and code).
  Every refresh (load, an expiring token, a 401) shares one in-flight promise. A 401 from core gets
  one refresh and one retry; a second 401 ends the session locally. Expiry is the token's
  lifetime against the server's `Date`, kept as a monotonic deadline, with a minimum gap between
  proactive refreshes.
  After a laptop sleep the monotonic clock may not have advanced, so the first call can go out with
  an expired token and costs one 401, refresh and retry. This is accepted: checking the wall clock
  too cannot tell a sleep from a clock change, and a test pins that moving it changes nothing.
- Sign-out calls auth, then clears memory whatever the answer, and tells other tabs over a
  `BroadcastChannel` (`signed_in` / `signed_out` only, never a token).
- The path-to-service table is `src/api/service-routes.ts`. The dev server proxies those prefixes,
  unchanged, to `AUTH_PROXY_TARGET` / `CORE_PROXY_TARGET` / `PLAYBOOK_PROXY_TARGET` / `VOICE_PROXY_TARGET`; `/internal` is never routed. A new route
  in auth, core, playbook (`/v1/playbook`) or voice (`/v1/lines`) needs its prefix there (a test fails until it has one).
- Lines admin (`src/screens/LinesScreen.tsx`, voice): Owners and Admins only (`can.manageLines`); for
  anyone else the nav link is hidden and the page shows a notice and makes no request. A Line's number
  and label are untrusted text (`Untrusted`, `plain`). Errors are worded by `presentLine`
  (`src/api/voice-messages.ts`) from `VOICE_ERRORS`, falling back to `presentManage`.
- API keys (`src/screens/ApiKeysScreen.tsx`, core): Owners and Admins only (`can.manageApiKeys`); for
  anyone else the nav link is hidden and the page shows a notice and makes no request. The secret
  returned by create lives only in the dialog's component state: never stored, logged or put in a
  URL, and gone when the dialog closes. Key names are untrusted (`Untrusted`). Errors are worded by
  `presentApiKey` (`src/api/api-key-messages.ts`).
- Inbox (`src/screens/inbox/`, core; routes `/inbox` and `/inbox/$conversationId`): any role; core limits a
  Rep to their own Conversations, the screen sends no owner filter. Message bodies render as text only. The list
  shows no Prospect names (no N+1); the Conversation view resolves the Prospect and, only for roles that may
  list members, the Rep name (otherwise "A Rep").
  Takeover, hand back and Rep replies (`ConversationControls.tsx`) send an Idempotency-Key through
  `app.keys`; the answered Conversation is written into the cache, so the next render shows who
  answers. "Escalated to me" is `state=escalated` (limit 100, `100+` when more): core lists a Rep only
  their own, but has no owner filter, so other roles see "Escalated" over everything they may see.
  Escalation rules (`/inbox/escalation`, Owner and Admin, `src/api/escalation.ts`) use a local
  schema because the contract has none yet; replace it when the contract adds one.
- Agent (`/agent`, `src/screens/agent/`, `src/api/agent.ts`): Owner, Admin and Manager open it
  (`can.viewAgent`); a Rep gets a notice and no request. Only Owner and Admin (`can.manageAgent`)
  see the editor, versions, publish/roll back, control level edits and pause; a Manager reads the
  published text and the settings. Publish, rollback and pause are confirmed with their effect
  (the core audit log records them). Contact Consent and the AI and recording disclosure are listed
  as fixed rules and have no switch (ADR 0003).
- Developers (`src/screens/DevelopersScreen.tsx`): renders the vendored public OpenAPI document
  (`openapi/public.openapi.json`, refreshed with `bun run vendor:public -- --from <hub clone>`) and
  calls no private route. Visible to every role.
- Suggestions review (`src/screens/SuggestionsScreen.tsx`, `src/screens/suggestions/`): Owner and
  Admin only (`can.managePlaybook`); anyone else gets a notice and no request. Suggestion and Moment
  text is untrusted and shown as text. There is no page for one Call or Moment, so a citation
  superscript opens a footnote of the Moment text read through `POST /v1/playbook/citations/resolve`
  (only after it is opened) and links to the Calls of its Deal. Accept and reject send an
  Idempotency-Key held through `app.keys`; a 409 `suggestion.not_pending` says it was already
  decided and refreshes the list.
- Playbook documents (`src/screens/DocumentsScreen.tsx`): file names are untrusted and shown as text
  only (`Untrusted`, `plain` for labels), never as a link or markup. Upload limits come from the
  contract's constants and `checkUploadFile`, never typed numbers. The follow-up poll waits through
  `app.sleep` (so tests control it), is bounded, and stops when hidden, left or nothing is pending.
  Cost: TanStack Query 5 has no per-page refetch for an infinite query, and writing single pages
  into the cache by hand is not worth the risk, so each tick refetches every loaded page: N
  requests per tick (N = pages loaded), at most 22 ticks per pending episode. A test pins N. The
  waits restart only when a new pending document appears, not when one changes state.
- Sales history (`src/screens/sales/`, routes under `/sales-history`, Owner and Admin only: `can.manageSalesHistory`;
  `SalesLayout` renders a notice for any other role and mounts nothing, so no request is made). The customer's
  deal id travels in request bodies only (`POST /v1/playbook/deals/lookup`, a Call upload's multipart field);
  portal addresses carry the opaque `deal_…` id. Deal ids, names, speaker labels and file names are text only
  (`Untrusted`) and are made safe with `csvCell` in anything exported (a deal id may begin with `=`, `+`, `-`,
  `@`). The rights wording is the contract's (`RIGHTS_WORDINGS`, read with its `rightsWordingFor`, through
  `app.rightsWording`); the screen shows its `draft` flag ("pending a lawyer's check"), a version the contract has
  no text for cannot be confirmed, and a `currentWording` sent by the service is only compared with the contract's
  (a difference is reported once, status and code only, and the contract's text is shown). The
  `from` search param of the rights route is checked against an allowlist (`parseBackPath`), in the route and
  again in the screen (the router hands the raw value through). Polling uses `SALES_POLL_SCHEDULE_MS` (first
  wait 3 s) via `app.sleep`. A Transcript chosen before the rights are confirmed is held by `app.pendingCall`
  (memory only, per Organization, cleared on sign-out) and restored on return; the Calls list takes only an
  opaque `deal_…` id in `?deal=`.
- The Invitation token is never logged, reported or kept in the address bar.
- Never log, report or show a token, cookie value, code, password or email address. Report only unexpected errors
  (5xx, crashes); never validation, 401, 403, 404, 409 or 429. The one exception is the 403 from auth's Origin check on
  load (`misconfigured`): it is a deployment mistake, so it is reported once with its status and code. Sentry 11 has no `sendDefaultPii`:
  `dataCollection` is all off.
- Every label and message uses `GLOSSARY.md` words (Organization, Rep, Invitation, Owner, Admin).
  Messages say what happened and what to do, and never reveal whether an address is registered
  beyond what the auth API itself reveals.
- Forms: a label on every field, errors tied with `aria-describedby`, focus moved to the first
  error, `aria-disabled` while submitting (and a guard against a second submit), 16 px inputs.
- A generated file (`*.gen.ts`, `openapi/`) is changed only by its script.
- `bun test` needs a DOM: `test/dom.ts` registers happy-dom before Testing Library loads. In
  `test.each`, give every row all parameters, or Bun reads the last one as a `done` callback.
- Analytics dashboards (`src/screens/analytics/`, `/analytics`, `/analytics/campaigns`,
  `/analytics/reps`) read core's `/v1/analytics/*` (a `service-routes` prefix). Every role reads,
  within its scope: Owner and Admin see all; a Manager sees their Reps and filters only by Rep; a Rep
  sees their own row. A view the role cannot use is hidden (`can.compareCampaigns`,
  `can.compareReps`), and Manager and Rep requests never carry Channel, Agent or Campaign. A table
  (and its CSV) may carry only a filter on its own `groupBy` dimension (core answers `request.invalid`
  otherwise), so Channel and Agent filter the Overview charts only. A rate
  below `MIN_RATE_SAMPLE` arrives as `not_enough_data`: show it with its sample size, never as zero.
  Failures are branched on `area.reason` (`analytics.range_too_large`, `auth.forbidden`,
  `request.not_found`, `request.invalid`) in `analytics-messages.ts`. Drill-down opens the Inbox with Channel and label
  only, because core cannot yet filter Conversations by Campaign, Rep or day, and the screen says so.
  The CSV loops `table.csv` by `x-next-cursor`, one header, at most 20 pages.

## Hot paths

None: this is a dashboard. Add one here, with a budget, if the portal gains live audio or a large
list view.
