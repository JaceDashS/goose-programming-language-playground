# Hub Run Scenarios

- Design: [Hub Run Design](../../../design/run/20-hub-run.md#run-endpoint)

## Allowed Origin Runs Code
- Input: `POST /goose/run` from `https://goose-playground.jace-s.com` with code and a Turnstile token.
- Steps: origin passes → Turnstile passes → only `code` is forwarded.
- Result: the runner's RunResult with `Access-Control-Allow-Origin` set; the runner never sees the token.
- Test: `server/internal/hub/hub_test.go` → `TestRunForwardsWithoutTurnstileToken`. Checked through the compose stack on local Docker on 2026-11-08 (`print(6 * 7)` → `42`).

## Other Origin Refused
- Input: no `Origin`, or `https://evil.example`.
- Result: 403 `forbidden_origin`.
- Test: `TestRunRejectsOtherOrigin`.

## Turnstile Failure
- Input: Turnstile enabled, token rejected.
- Result: 403 `turnstile_failed`.
- Test: `TestRunTurnstileFailure`.

## Code Too Large
- Input: 65537 bytes of code.
- Result: 413 `too_large`.
- Test: `TestRunTooLarge`.

## Runner Busy
- Input: the runner answers 503 `busy`.
- Result: the same 503 `busy` reaches the browser.
- Test: `TestRunPassesBusyThrough`.

## Runner Down
- Input: the runner address does not answer.
- Result: 503 `unavailable` for runs; health reports `runner: "down"`, `freeRunSlots: 0`, `agentAvailable: false`.
- Test: `TestRunRunnerDown`, `TestHealth`.

## Preflight
- Input: `OPTIONS /goose/run` from the allowed origin.
- Result: 204 with `POST` and `Content-Type` allowed.
- Test: `TestPreflight`.

## Client IP Behind Cloudflare
- Input: a request with `CF-Connecting-IP: 203.0.113.7` arriving from the gateway container.
- Result: the client IP is `203.0.113.7`, not the gateway's address.
- Test: `TestClientIPPrefersCloudflareHeader`.
