# Run API

Status: draft, awaiting confirmation. Field names and status codes may still change.

- Schemas: `schema/run-request.schema.json`, `schema/run-result.schema.json`, `schema/error.schema.json`, `schema/health.schema.json`
- Source: the jace-s platform owns these schemas (`services/goose/schema/`) and the hub and runner; `schema/` here is a copy checked by the platform. Generated client types: `frontend/src/lib/generated/`.
- Architecture: [Data Flow](../architecture/20-data-flow.md#run-request)

## Endpoints

| Method and path | Served by | Body | Success |
| --- | --- | --- | --- |
| `POST /goose/run` | Hub (`api.jace-s.com`) | RunRequest | 200 RunResult |
| `GET /goose/health` | Hub | none | 200 Health |
| `POST /run` | Runner (internal address only) | RunRequest | 200 RunResult |
| `GET /health` | Runner (internal address only) | none | 200 Health |
| `POST /api/run` | Vercel fallback | RunRequest | 200 RunResult |

Every error uses ErrorResponse: `{"error": {"code": "...", "message": "..."}}`.

## Run Request And Result

Request:

```json
{ "code": "fn main() {\n    print(\"hello\");\n}\n", "turnstileToken": "0.abc" }
```

Result fields:

| Field | Meaning |
| --- | --- |
| `outcome` | `compile_error`, `exited`, `timeout`, `output_limit` or `killed` |
| `exitCode` | Program exit code when `outcome` is `exited`, else `null` |
| `stdout`, `stderr` | Program output, cut at the output cap |
| `diagnostics` | Errors and warnings from `goose check --diagnostics json` (line, col, message) |
| `truncated` | Output was cut |
| `durationMs` | Time inside the container, check included |
| `backend` | `onprem` or `sandbox` |

Why `compile_error` is separate: `goose run` exits with 1 both when the program does not compile and when it aborts. The runner runs `goose check --diagnostics json` first, so the editor can mark the exact line and the AI `check` tool gets structured errors.

## Error Codes

| Code | HTTP | Browser action |
| --- | --- | --- |
| `invalid_request` | 400 | Show the message |
| `too_large` | 413 | Show the message (code over 65536 bytes) |
| `forbidden_origin` | 403 | Show the message |
| `turnstile_failed` | 403 | Retry the Turnstile challenge |
| `rate_limited` | 429 | Show the message, no fallback |
| `busy` | 503 | Fall back to `/api/run` |
| `use_primary` | 409 | Fallback refused: retry the hub |
| `unavailable` | 503 | Hub: fall back. Fallback: Outage |
| `internal` | 500 | Show the message |

A connection failure or a timeout on the hub is treated like `busy`.

## Example

- Input: `POST /goose/run` with `{"code": "fn main() { print(1 + ); }"}` while one run slot is free.
- Steps: The hub checks origin and size, asks the runner, and the runner's `goose check` fails.
- Result: 200 with `outcome: "compile_error"`, `exitCode: null`, and one `diagnostics` entry pointing at line 1.

Fallback validation, limits and configuration are documented in [Vercel Fallback Design](../design/run/30-vercel-fallback.md).
