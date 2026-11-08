# Code Run Scenarios

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
