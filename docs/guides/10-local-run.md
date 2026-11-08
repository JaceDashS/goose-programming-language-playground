# Local Run

How to run the hub and runner on a development machine with Docker. gVisor is usually not installed locally, so the runner is started with `RUNNER_RUNTIME=default`. Never use that setting on a server.

## Steps

```bash
docker build -t goose-run:v2026.4 runimage
docker network create goose-gateway        # once; stands in for the jace-s gateway network
RUNNER_RUNTIME=default docker compose -f deploy/compose.yaml up -d --build
docker run --rm --network goose-gateway curlimages/curl:8.10.1 -s \
  -X POST http://hub:8080/goose/run \
  -H "Origin: https://goose-playground.jace-s.com" -H "Content-Type: application/json" \
  -d '{"code":"fn main() { print(6 * 7); }"}'
docker compose -f deploy/compose.yaml down
```

On Git Bash for Windows, prefix the `docker run` line with `MSYS_NO_PATHCONV=1`.

## Without Compose

```bash
cd server
RUNNER_ADDR=127.0.0.1:8090 RUNNER_IMAGE=goose-run:v2026.4 RUNNER_RUNTIME=default go run ./cmd/runner
ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/hub
```

## Example

- Input: The steps above on a machine with Docker Desktop.
- Steps: Build the run image, start the stack, post the sample program.
- Result: `{"outcome":"exited","exitCode":0,"stdout":"42\n",...}`.
