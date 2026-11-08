# Code Run

> Archived 2026-11-08: The Goose hub, runner and run image moved to the jace-s platform repository (`services/goose/`), which now owns this document. This repository keeps only the browser client.

- Design: [Code Run Design](../../design/run/10-code-run.md)
- API: [Run API](../../../api/10-run.md)

## Requirements

- A run executes one Goose file of at most 65536 bytes with `goose run`, after `goose check` passes.
- If the check fails, nothing runs and the result carries the compiler diagnostics with line and column.
- Every run uses a new isolated container: no network, read-only root, non-root user, 1 CPU, 512 MB, 64 processes, and gVisor in production.
- A run stops after 10 seconds (check included) or after 1 MB of combined stdout and stderr. The result says which limit stopped it.
- At most 2 runs execute at once. A third request is refused at once with `busy`, so the browser can fall back.
- The program gets no stdin and no arguments.
- Values above are the tentative defaults (D-0017 in the planning decisions) and may change.

## Example

- Input: Two runs of an endless loop are executing, and a third user presses Run.
- Steps: The third request finds no free run slot.
- Result: 503 `busy` at once. After 10 seconds the two loops end with `outcome: "timeout"`.
