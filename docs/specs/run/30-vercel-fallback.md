# Vercel Fallback

- Related: [Run API](../../api/10-run.md), [Code Run](10-code-run.md), [Data Flow](../../architecture/20-data-flow.md#fallback)
- Current stub: `frontend/src/app/api/run/route.ts`

## Requirements

- `POST /api/run` on the Vercel deployment accepts RunRequest and answers RunResult (with `backend: "sandbox"`) or ErrorResponse, exactly as in the Run API.
- Origin: only `https://goose-playground.jace-s.com` (and `http://localhost:3000` when `NODE_ENV` is development). Others → 403 `forbidden_origin`.
- Size: code over 65536 UTF-8 bytes → 413 `too_large`.
- Turnstile: when `TURNSTILE_SECRET` is set, verify the token like the hub does; failure → 403 `turnstile_failed`.
- Primary check first: call `GET {HUB_URL}/goose/health` with a 2 s timeout. If it answers `runner: "up"` and `freeRunSlots > 0`, refuse with 409 `use_primary` and do not create a sandbox.
- Global caps: at most `SANDBOX_HOURLY_CAP` (default 30) and `SANDBOX_DAILY_CAP` (default 150) sandbox runs. Over a cap → 503 `unavailable`. Counting goes through an interface with an in-memory implementation for now; the real store is decided later.
- Run in Vercel Sandbox (`@vercel/sandbox`): Goose v2026.4 linux-x64, verified with SHA-256 `559ad7572df89fcd1273512d8679528bcdf876c252ec1f31608d3808b24125b3`. Same behaviour as the run image: `goose check --diagnostics json` first; on failure `compile_error` with diagnostics and nothing runs; otherwise `goose run` with no stdin.
- Same limits as on-prem: 10 s including the check, 1 MB of combined output. Map the end of the run to the same `outcome` values. Always stop the sandbox, also on errors.
- Unit tests mock the sandbox and the hub; they cover every error code above and every outcome.
- Do not create Vercel projects, tokens or deployments. Running against a real sandbox needs the project owner.

## Example

- Input: The hub's health says `freeRunSlots: 1`, and a request arrives at `/api/run`.
- Steps: the primary check sees a healthy hub.
- Result: 409 `use_primary`; no sandbox is created and the cap counters do not change.
