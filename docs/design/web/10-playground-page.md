# Playground Page Design

- Spec: [Playground Page](../../specs/web/10-playground-page.md)
- Architecture: [Overview](../../architecture/10-overview.md#service-states), [Data Flow](../../architecture/20-data-flow.md#fallback)
- All scenarios: [Playground Page Scenarios](../../testing/scenarios/web/10-playground-page.md#playground-page-scenarios)

## Run Client

- Input: code, endpoints (`primary`, `fallback`), optional `getToken()` that returns a fresh Turnstile token, and `fetch`.
- Output: `RunOutcome`: `{kind: "result", result, state}` or `{kind: "error", code, message, state}`; `state` is the service state this attempt observed.
- Code: `frontend/src/lib/runGoose.ts` → `runGoose()`.
- Steps:
  1. POST to the primary with a 20 s timeout.
  2. Success → state `normal`. Error `busy`, `unavailable`, a 5xx without JSON, or a network failure → step 3. Any other error → shown, no fallback.
  3. POST to the fallback. Success → state `degraded`.
  4. Fallback `use_primary` → retry the primary once. Fallback `unavailable` or network failure → state `outage`.
- Every POST (primary, fallback, retry) first calls `getToken()` when it is given. A failure there returns `turnstile_failed` without sending. Without `getToken()` the body is only `{code}`.
- Scenario: Primary network failure → fallback 200 → the result is shown with `backend: "sandbox"` and state `degraded`.

## Turnstile Widget

- Input: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time, a container element, `window.turnstile` loaded from `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`.
- Output: `getToken()` resolving with a single-use token, or rejecting when the check fails or times out (60 s).
- Code: `frontend/src/lib/turnstile.ts` → `turnstileSiteKey()`, `loadTurnstile()`, `createTurnstileWidget()`; `Playground.tsx` renders the container and passes `getToken` to `runGoose()`.
- The container is the final item in the Run toolbar, right aligned with `margin-left: auto` and prevented from shrinking. It does not create a separate page row.
- The widget is rendered once with `execution: "execute"` and `appearance: "interaction-only"`. Each `getToken()` resets and executes it; a newer request rejects the older pending one, and an old timer cannot cancel a newer request.
- No site key → no script, no container, no token. The hub and the fallback skip verification while their `TURNSTILE_SECRET` is empty, so the order of rollout is page first, then secrets.
- Scenario: Hub `busy` → `getToken()` is called again → the fallback receives a token the hub never saw.
- All scenarios: [Turnstile Tokens](../../testing/scenarios/web/10-playground-page.md#turnstile-tokens).

## Service State

- Code: `frontend/src/lib/serviceState.ts` → `stateFromHealth()`, `agentAllowed()`, `recheckDelayMs()`, `BANNER`.
- `stateFromHealth(health, fallbackDown)`: normal only when the runner is up with a free slot; otherwise degraded, or outage when the last fallback attempt failed.
- The page component keeps `fallbackDown` from the last run, so a health check alone cannot hide an outage that a run has seen.

## Page

- Code: `frontend/src/components/Playground.tsx`, `frontend/src/components/OutputPanel.tsx`, `frontend/src/components/Playground.module.css`, `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`.
- Icons: `frontend/src/app/favicon.ico` (16–64 px), `frontend/src/app/icon.png` (512 px), `frontend/src/app/apple-icon.png` (180 px), `frontend/public/icon-192.png`, `frontend/public/icon-512.png`, `frontend/public/Goose-Playground.png` (384 px app list icon) and `frontend/public/Goose-Playground-original.png` (1024 px master).
- Endpoints: `frontend/src/lib/endpoints.ts`. `NEXT_PUBLIC_HUB_URL` overrides the hub origin for local development.
- Layout: a flex column of header (brand icon and title, Goose project, Log in or the account), banner, toolbar, two panes (one column under 760 px) that take the spare height, and the AI panel ([AI Connection Design](40-ai-connection.md)). Colors are CSS variables with a dark scheme. `globals.css` sets `color-scheme` per theme and gives every scroller (page, editor, output, toolbar) a thin scrollbar with the `--scrollbar` thumb on a transparent track.
- Endpoints also include the session socket, the MCP URL, the account API origin (the hub origin) and the main site (`NEXT_PUBLIC_SITE_URL`).
- The editor is a plain `textarea` until the editor component is chosen.
- Contract types: `frontend/src/lib/contract.ts` re-exports generated schema types. See [Contract Types](15-contract-types.md).

## Fallback Route

- Code: `frontend/src/app/api/run/route.ts`. Validates and runs isolated fallback requests. See [Vercel Fallback Design](../run/30-vercel-fallback.md).
- Spec for the implementation: [Vercel Fallback](../../specs/run/30-vercel-fallback.md).

`Playground.tsx` also loads static release samples through the [Samples Design](20-samples.md).
`Playground.tsx` restores hash code and copies shared links as described in [URL Sharing](30-url-sharing.md).

## Toolbar Controls

- Input: Existing theme variables, viewport width, keyboard focus and pointer interaction.
- Output: Run, Sample and Share have a shared 40 px minimum height and matching rounded controls. Sample retains a native select with a decorative CSS chevron; Share uses a secondary outlined button. Both use the existing panel, text, border and accent variables in light and dark themes.
- Code: frontend/src/components/Playground.tsx and frontend/src/components/Playground.module.css.
- The toolbar stays on one horizontally scrollable row on small screens; the sample field grows to fill the row but keeps a 160 px minimum width, so share feedback or the Cloudflare check scrolls the row instead of collapsing the field. Under 760 px the visible "Sample" word is hidden; the select keeps its `aria-label` and its "Choose a sample" placeholder. Empty feedback is hidden. Keyboard focus is outlined, and hover and pressed states use theme colors.
- Example input: A 375 px viewport with focus on Sample.
- Example steps: Tab to Sample, choose a sample, then focus and activate Share.
- Expected result: Visible focus, readable themed controls, no horizontal overflow and an unchanged share workflow.
- Scenarios: [Playground Page Scenarios](../../testing/scenarios/web/10-playground-page.md#toolbar-theme-and-responsive-layout).

## AI Tool Ownership

AI calls temporarily make the editor read-only and disable sample selection and Run, including keyboard execution. A visible reason and a separate failure notice explain ownership and refusals. See [AI Connection Design](40-ai-connection.md#lock-and-refusal-handling).
