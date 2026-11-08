# Hub Run Design

- Spec: [Hub Run](../../specs/run/20-hub-run.md)
- Architecture: [Overview](../../architecture/10-overview.md#components), [Data Flow](../../architecture/20-data-flow.md#run-request)
- All scenarios: [Hub Run Scenarios](../../testing/scenarios/run/20-hub-run.md#hub-run-scenarios)

## Run Endpoint

- Input: `POST /goose/run` with RunRequest, from the browser through Cloudflare and the jace-s gateway nginx.
- Output: the runner's answer passed through (RunResult, `busy`, `too_large`), or the hub's own errors (`forbidden_origin`, `invalid_request`, `too_large`, `turnstile_failed`, `unavailable`).
- Code: `server/internal/hub/hub.go` → `Hub.run()`, `Hub.preflight()`; `server/cmd/hub/main.go`.
- Steps:
  1. The `Origin` header must be in `ALLOWED_ORIGINS`; otherwise 403 `forbidden_origin`. Requests without `Origin` are refused too.
  2. Decode the body with a size cap; code over 65536 bytes → 413 `too_large`.
  3. When `TURNSTILE_SECRET` is set, verify `turnstileToken` with Cloudflare for the client IP (`CF-Connecting-IP`).
  4. Forward only `code` to the runner's internal `POST /run`.
  5. Runner unreachable → 503 `unavailable`, which the browser treats as a reason to fall back.
- The hub serves the full `/goose/...` paths, so the gateway forwards them without rewriting.
- Scenario: The runner answers 503 `busy` → the hub passes it through unchanged → the browser calls the Vercel fallback.

## Health Endpoint

- Input: `GET /goose/health`.
- Output: Health. Always 200; a runner that does not answer within 2 s is reported as `runner: "down"`, `freeRunSlots: 0`.
- Code: `Hub.health()`.
- `agentAvailable` follows the runner until agent sessions exist.

## Deployment

- Code: `server/Dockerfile` (targets `hub` and `runner`), `deploy/compose.yaml`.
- The hub image is distroless and runs as non-root. It joins the `internal` network (to reach the runner) and the external `goose-gateway` network (reached by the jace-s gateway).
- The runner image has the docker client and the host Docker socket. It joins only the `internal` network, which has no outside access.
- Guide: [Local Run](../../guides/10-local-run.md).

The hub joins goose-gateway with the goose-hub alias; the platform gateway forwards the unchanged /goose/ prefix. The runner stays on its private network. See [On Premises Rollout](../../operations/30-onprem-rollout.md).
