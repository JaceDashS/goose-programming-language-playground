# Playground Page Scenarios

- Design: [Playground Page Design](../../../design/web/10-playground-page.md#run-client)

## Primary Runs The Code
- Input: the hub answers 200.
- Steps: `runGoose()` posts once.
- Result: result shown, state normal, the fallback is not called.
- Test: `frontend/src/lib/runGoose.test.ts` → "uses the primary when it answers".

## Fallback On Busy Or Unreachable Primary
- Input: the hub answers 503 `busy`, 503 `unavailable`, a 502 page without JSON, or the request fails.
- Steps: `runGoose()` calls `/api/run` with the same code.
- Result: the Sandbox result is shown, state degraded.
- Test: "falls back on %s" (four cases).

## No Fallback On Client Errors
- Input: `rate_limited`, `turnstile_failed`, `too_large` or `forbidden_origin` from the hub.
- Result: the message is shown; the fallback is not called, so the Sandbox quota is not spent.
- Test: "does not fall back on %s".

## Fallback Refuses Because The Primary Is Healthy
- Input: the hub request fails once, the fallback answers 409 `use_primary`.
- Steps: retry the hub once.
- Result: the hub's result is shown, state normal.
- Test: "retries the primary once when the fallback says use_primary".

## Outage
- Input: the hub is unreachable and the fallback answers 503 `unavailable`.
- Result: "Temporary service outage.", state outage, Run disabled.
- Test: "reports an outage when both are unavailable".

## Health Drives The Banner
- Input: health `{runner: "up", freeRunSlots: 0}`, or no answer.
- Result: degraded (outage if the last fallback failed). Only `runner: "up"` with a free slot is normal.
- Test: "is normal only with the runner up and a free slot".

## Health Recheck Backoff
- Input: the state stays degraded.
- Result: rechecks after 5, 10, 20, 40, then every 60 s; every 5 s while normal.
- Test: "backs off while not normal".

## Local End To End
- Input: runner and hub binaries on local Docker, hub `ALLOWED_ORIGINS=http://localhost:3000`.
- Steps: preflight `OPTIONS /goose/run`, then POST the default program.
- Result: 204 with CORS headers; `stdout: "Hello, Goose!\n"`. Checked 2026-11-08.

## Primary Route Not Published

- Input: Public editor has loaded but the primary /goose/run endpoint answers HTTP 404 because its service and gateway route have not been published.
- Steps: Enter the hello program and press Run.
- Expected result: The current client reports HTTP 404 and does not use fallback. Publishing is incomplete until the primary service and route are available; a fully published hello run must display Hello, Goose with exit code 0.
- Evidence: Production browser verification on 2026-11-08.
