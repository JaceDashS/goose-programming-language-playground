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

## Public Fallback After Hub Publication

- Input: Public hello program with the on-prem hub published and primary runner awaiting gVisor.
- Steps: Press Run; the hub returns unavailable with CORS; the browser invokes Vercel fallback.
- Expected result: Exited with code 0, Hello, Goose output and backup server status. Verified in the production browser on 2026-11-08.

## Public Primary After gVisor Rollout

- Input: Public hello program with the primary runner running under gVisor.
- Steps: Open the deployed playground and press Run.
- Expected result: Exited with code 0, Hello, Goose output and server status. GET /goose/health reports runner up with free slots. A direct POST to Vercel fallback returns use_primary without creating a sandbox. Verified in the production browser and HTTP endpoints on 2026-11-08.

## Toolbar Theme And Responsive Layout

- Input: Desktop and phone viewports, light and dark themes, Sample dropdown and Share button.
- Steps: Inspect matching control heights, hover the controls, tab through their focus states, select 07_sieve and share the code.
- Expected result: Both controls match the toolbar theme, dropdown text and chevron stay readable, keyboard focus is visible, the mobile toolbar stays on one horizontally scrollable row, sample selection and sharing keep working.
- Design: [Toolbar Controls](../../../design/web/10-playground-page.md#toolbar-controls).

## Turnstile Tokens

- Input: Site key built in; the hub answers 503 `busy`, then the fallback answers 200.
- Steps: `runGoose()` calls `getToken()` before each request.
- Expected result: The hub gets `token-1` and the fallback gets `token-2`. When the fallback answers `use_primary`, the retry gets a third token.
- Test: `frontend/src/lib/runGoose.test.ts` → "asks for a fresh token for the fallback after a busy primary", "uses a third token when the fallback sends it back to the primary".

## No Turnstile Site Key

- Input: A build without `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, hub without `TURNSTILE_SECRET`.
- Steps: Load the page and press Run.
- Expected result: No Turnstile script is requested and the request body is only `{code}`; the run works as before.
- Test: `Playground.test.tsx` → "runs without loading Turnstile when no site key is built in"; `runGoose.test.ts` → "sends no token field when Turnstile is not configured".

## Browser Check Fails

- Input: Site key built in; the widget reports an error, or no token arrives within 60 s.
- Steps: Press Run.
- Expected result: No run request is sent and the output shows `turnstile_failed` with "The browser check failed." or "The browser check timed out."
- Test: `runGoose.test.ts` → "reports turnstile_failed without sending when no token can be obtained"; `turnstile.test.ts`.

## Turnstile Production Rollout

- Input: Production page built with the site key; `TURNSTILE_SECRET` set in Vercel Production and for the platform hub.
- Steps: Press Run on https://goose-playground.jace-s.com; POST without a token to `/api/run` and to `https://api.jace-s.com/goose/run`.
- Expected result: The browser run succeeds; both tokenless requests return 403 `turnstile_failed`.
- Verified 2026-11-09: browser run passed (checked by the user); both tokenless requests returned 403; hub health reported the runner up with two free slots.

## Browser Check Toolbar Position

- Input: A configured site key and visible Cloudflare interaction, on desktop and narrow screens.
- Steps: Press Run and show the check.
- Expected result: The check is right aligned in the Run toolbar without a separate page row; narrow toolbars scroll horizontally.
- Design: [Turnstile Widget](../../../design/web/10-playground-page.md#turnstile-widget).
