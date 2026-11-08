# Code Run Scenarios

> Archived 2026-11-08: The Goose hub, runner and run image moved to the jace-s platform repository (`services/goose/`), which now owns this document. This repository keeps only the browser client.

- Design: [Code Run Design](../../../design/run/10-code-run.md#runner)

## Program Exits
- Input: `fn main() { print("hello"); }`
- Steps: check passes → `goose run` → exit 0.
- Result: `outcome: "exited"`, `exitCode: 0`, `stdout: "hello\n"`, empty `diagnostics`.
- Test: `server/internal/runner/runner_test.go` → `TestRunExited`. Checked against real Docker on 2026-11-08.

## Compile Error
- Input: `fn main() { print(1 + ); }`
- Steps: check fails with exit 1 → nothing runs.
- Result: `outcome: "compile_error"`, `exitCode: null`, one diagnostic at line 1, col 23, with the path shown as `main.goose`.
- Test: `TestRunCompileError`. Checked against real Docker on 2026-11-08.

## Time Limit
- Input: an endless loop.
- Steps: 10 s pass → the runner kills the container.
- Result: `outcome: "timeout"`, `exitCode: null`, after about 10 s.
- Test: `TestRunTimeout`. Checked against real Docker on 2026-11-08 (10.13 s).

## Output Limit
- Input: a loop that prints forever.
- Steps: combined output reaches 1 MB → the runner kills the container.
- Result: `outcome: "output_limit"`, `truncated: true`, stdout cut at the cap.
- Test: `TestRunOutputLimit`. Checked against real Docker on 2026-11-08.

## Container Dies Before The Check
- Input: the container is killed by the memory or process limit, or fails to start.
- Steps: no check header arrives, or the exit code is 137.
- Result: `outcome: "killed"`.
- Test: `TestRunKilledWithoutHeader`.

## All Run Slots Busy
- Input: two runs in progress and a third request.
- Steps: no free slot.
- Result: 503 `busy` at once; slots are released when the two runs end.
- Test: `TestRunBusy`. Checked against real Docker on 2026-11-08.

## Warm Pool Refill
- Input: a runner with a warm pool of 2.
- Steps: a run takes one waiting container.
- Result: a replacement starts in the background; the pool returns to 2.
- Test: `TestWarmPoolIsUsedAndRefilled`.

## Forged Check Header
- Input: a program that prints `GOOSE-CHECK 1 []`.
- Steps: the real header is always line 1 and is written before the program starts.
- Result: the program's line is ordinary stdout.
- Test: `TestParseHeaderRejectsProgramOutput` (plain output is not a header).

## Memory Exhaustion
- Input: a program that pushes to a growing array forever.
- Steps: the container reaches the 512 MB limit and is killed (exit 137).
- Result: `outcome: "killed"` after about 0.5 s. Checked against real Docker on 2026-11-08 (489 ms).

## Calling A C Library Function
- Input: `extern fn getpid() -> i32;` (or `system`) called from `main`.
- Steps: the check passes; `goose run` fails to link the symbol in TinyCC.
- Result: `outcome: "exited"`, `exitCode: 1`, stderr `tcc: error: unresolved reference to 'getpid'`. Checked against real Docker on 2026-11-08. This narrows what user code can call, but isolation does not rely on it: other extern routes may exist, so every container flag stays.

## Legacy Docker Builder

- Input: Green-G4 Docker builder without buildx and the runimage directory.
- Steps: Build goose-run:v2026.4; inspect image user and entrypoint and check run.sh permissions with a trusted stat command.
- Expected result: Build succeeds, configured user is 10001, entrypoint is /opt/goose/run.sh and file mode is 0555. No BuildKit-only COPY chmod instruction is required.
- Design: [Code Run](../../../design/run/10-code-run.md#docker-builder-compatibility).

## Production Runtime Isolation

- Input: Warm run containers after the production runner starts.
- Steps: Inspect container runtime, network mode and configured user; submit the hello program through the public hub.
- Expected result: Runtime runsc, network none, user 10001 and a successful onprem hello result. Existing platform container IDs match the pre-installation backup after Docker reload. Verified on Green-G4 on 2026-11-08.
