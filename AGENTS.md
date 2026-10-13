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

Other scripts are in `package.json`.

## Issues

All tickets live in the hub: `gh issue list -R Tula-Solutions/tula-closeline --label repo:portal`.

## Layout

Vite, React, TypeScript, TanStack Router (file routes in `src/routes/`, thin) and TanStack Query.
Plain CSS in `src/styles.css`: two colours (ink `#1A1A18`, paper `#F1EFE8`), tints by opacity, no
inline `style` attributes (the Content-Security-Policy forbids them), no CSS or component library.

- `src/main.tsx` boots: parse env, start reporting, build the app, take the Invitation from the URL.
- `src/app.ts` is the one composition root (HTTP clients, session, query cache, reporter). Screens
  get it from `useApp()`; tests build it with a `fetch` double (`src/testing/`).
- `src/api/`: `http.ts` (timeout on every call, jittered retry for GETs only, `ApiError`),
  `errors.ts`, `auth.ts` / `core.ts` (typed routes), `messages.ts` (an error code to plain words),
  `auth.gen.ts` (generated).
- `src/session/session.ts` holds the tokens; `src/report/` is the only door to Sentry.
- `src/screens/` has the screens and their tests; `src/ui/` the small shared form pieces.
- The portal imports only `tula-closeline-contract`, never server code (ADR 0006). The UI branches
  on an error's `area.reason` code, never its status.

## Rules specific to this repo

- Tokens live in memory only: never `localStorage`, `sessionStorage`, a cookie or a URL. A page
  reload ends the session (the auth service has no cookie delivery; see the report on ticket 1.17).
- The Invitation token is never logged, reported or kept in the address bar.
- Never log or report a token, code, password or email address. Report only unexpected errors
  (5xx, crashes); never validation, 401, 403, 404, 409 or 429. Sentry 11 has no `sendDefaultPii`:
  `dataCollection` is all off.
- Every label and message uses `GLOSSARY.md` words (Organization, Rep, Invitation, Owner, Admin).
  Messages say what happened and what to do, and never reveal whether an address is registered
  beyond what the auth API itself reveals.
- Forms: a label on every field, errors tied with `aria-describedby`, focus moved to the first
  error, `aria-disabled` while submitting (and a guard against a second submit), 16 px inputs.
- A generated file (`*.gen.ts`, `openapi/`) is changed only by its script.
- `bun test` needs a DOM: `test/dom.ts` registers happy-dom before Testing Library loads. In
  `test.each`, give every row all parameters, or Bun reads the last one as a `done` callback.

## Hot paths

None: this is a dashboard. Add one here, with a budget, if the portal gains live audio or a large
list view.
