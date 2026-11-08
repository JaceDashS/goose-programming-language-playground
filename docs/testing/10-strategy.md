# Test Strategy

## Levels
- Unit tests run without Docker. The runner is tested against a fake backend that imitates the run image protocol (`server/internal/runner/runner_test.go`).
- Contract tests check that every schema example in `schema/` decodes into the Go types (`server/internal/contract/contract_test.go`).
- Container checks run the real image with real Docker. They are run by hand before a release and recorded in the scenario documents with the date.

## Commands
- Go: `go test ./...` in `server/`.

## Test Data
- Test programs are short inline Goose sources. No user code is stored as test data.

## Example
- Input: A change to how the runner reads output.
- Steps: `go test ./...` in `server/`, then run the image with real Docker for the output limit scenario.
- Result: Unit tests pass and the scenario document gets a new check date.
