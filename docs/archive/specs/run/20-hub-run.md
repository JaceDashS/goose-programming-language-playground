# Hub Run

> Archived 2026-11-08: The Goose hub, runner and run image moved to the jace-s platform repository (`services/goose/`), which now owns this document. This repository keeps only the browser client.

- Design: [Hub Run Design](../../design/run/20-hub-run.md)
- API: [Run API](../../../api/10-run.md)

## Requirements

- Only `https://goose-playground.jace-s.com` may call `POST /goose/run`. Other origins, and requests with no origin, are refused.
- When Turnstile is enabled, a run without a valid token is refused.
- The hub never forwards the Turnstile token to the runner, and the runner is never reachable from outside.
- If the runner cannot be reached, the hub answers 503 `unavailable` so the browser can fall back.
- `GET /goose/health` always answers, and reports the runner as down when it does not respond.
- Per-user and global quotas come with the abuse control work and are not part of this step.

## Example

- Input: A page on `https://evil.example` posts code to `/goose/run`.
- Steps: The hub compares the `Origin` header with the allowed list.
- Result: 403 `forbidden_origin`; nothing reaches the runner.
