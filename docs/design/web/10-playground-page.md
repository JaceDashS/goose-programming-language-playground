# Playground Page Design

- Spec: [Playground Page](../../specs/web/10-playground-page.md)
- Architecture: [Overview](../../architecture/10-overview.md#service-states), [Data Flow](../../architecture/20-data-flow.md#fallback)
- All scenarios: [Playground Page Scenarios](../../testing/scenarios/web/10-playground-page.md#playground-page-scenarios)

## Run Client

- Input: code, endpoints (`primary`, `fallback`), optional Turnstile token and `fetch`.
- Output: `RunOutcome`: `{kind: "result", result, state}` or `{kind: "error", code, message, state}`; `state` is the service state this attempt observed.
- Code: `frontend/src/lib/runGoose.ts` → `runGoose()`.
- Steps:
  1. POST to the primary with a 20 s timeout.
  2. Success → state `normal`. Error `busy`, `unavailable`, a 5xx without JSON, or a network failure → step 3. Any other error → shown, no fallback.
  3. POST to the fallback. Success → state `degraded`.
  4. Fallback `use_primary` → retry the primary once. Fallback `unavailable` or network failure → state `outage`.
- Scenario: Primary network failure → fallback 200 → the result is shown with `backend: "sandbox"` and state `degraded`.

## Service State

- Code: `frontend/src/lib/serviceState.ts` → `stateFromHealth()`, `agentAllowed()`, `recheckDelayMs()`, `BANNER`.
- `stateFromHealth(health, fallbackDown)`: normal only when the runner is up with a free slot; otherwise degraded, or outage when the last fallback attempt failed.
- The page component keeps `fallbackDown` from the last run, so a health check alone cannot hide an outage that a run has seen.

## Page

- Code: `frontend/src/components/Playground.tsx`, `frontend/src/components/OutputPanel.tsx`, `frontend/src/components/Playground.module.css`, `frontend/src/app/globals.css`.
- Endpoints: `frontend/src/lib/endpoints.ts`. `NEXT_PUBLIC_HUB_URL` overrides the hub origin for local development.
- Layout: header, banner, toolbar, two panes (one column under 760 px), AI panel. Colors are CSS variables with a dark scheme.
- The editor is a plain `textarea` until the editor component is chosen.
- Contract types: `frontend/src/lib/contract.ts` re-exports generated schema types. See [Contract Types](15-contract-types.md).

## Fallback Route

- Code: `frontend/src/app/api/run/route.ts`. Currently a stub that answers 503 `unavailable`.
- Spec for the implementation: [Vercel Fallback](../../specs/run/30-vercel-fallback.md).

