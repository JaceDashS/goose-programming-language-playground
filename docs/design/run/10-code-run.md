# Code Run Design

- Spec: [Code Run](../../specs/run/10-code-run.md)
- Architecture: [Overview](../../architecture/10-overview.md#isolation)
- All scenarios: [Code Run Scenarios](../../testing/scenarios/run/10-code-run.md#code-run-scenarios)

## Runner

- Input: RunRequest (`code`) on the runner's internal `POST /run`.
- Output: RunResult, or ErrorResponse `busy` (503), `too_large` (413), `invalid_request` (400), `unavailable` (503).
- Code: `server/internal/runner/runner.go` → `Runner.Run()`, `execute()`; `server/internal/runner/http.go` → `Handler()`; `server/cmd/runner/main.go`.
- Steps:
  1. Take a run slot without waiting. None free → `ErrBusy`.
  2. Take a warm container, or start one if the pool is empty. Start a replacement in the background.
  3. Write the code to the container's stdin and close it. Start the time limit.
  4. Read the check header line, then stdout and stderr under one shared output budget.
  5. When a limit fires, record the reason first, then kill the container.
  6. Build the result: limit reason, else `compile_error` when the check failed, else `killed` when there was no header or exit 137, else `exited` with the exit code.
- Configuration: `RUNNER_ADDR` (default `127.0.0.1:8090`), `RUNNER_IMAGE` (default `goose-run:v2026.4`), `RUNNER_RUNTIME` (default `runsc`; `default` disables gVisor for local development only).
- Scenario: The user runs an endless loop → step 3 starts a 10 s timer → the timer records `timeout` and kills the container → the result is `outcome: "timeout"`, `exitCode: null`.

## Docker Backend

- Code: `server/internal/runner/docker.go` → `DockerCLI.Start()`, `DockerCLI.Args()`.
- The runner calls the docker command line. Each container is named `goose-run-<random>` and labelled `goose-playground=run`.
- Kill runs `docker kill <name>`. Killing only the docker client process would leave the container running.
- Flags: `--network none --read-only --tmpfs /work --tmpfs /tmp --cpus 1 --memory 512m --memory-swap 512m --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges`, plus `--runtime runsc` in production.

## Run Image

- Code: `runimage/Dockerfile`, `runimage/run.sh`.
- Debian slim with `libc6-dev` (`goose run` needs libc headers on Linux) and the Goose v2026.4 linux-x64 release, verified by SHA-256.
- Runs as uid 10001. `GOOSE_HOME` is on the `/work` tmpfs.
- Protocol: stdin is the source. stdout line 1 is `GOOSE-CHECK <check exit> <diagnostics JSON>`, then the program's stdout. stderr is the program's stderr. The program runs only when the check passes. The header comes before any program output, so a program cannot forge it.
- Measured 2026-11-08 on a local Docker Desktop without gVisor: hello world 0.11 s inside the container and 0.2 s per request with a warm container; a cold `docker run` of the sieve sample 0.85 s.
