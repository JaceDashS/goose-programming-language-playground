# On Premises Rollout

## Hub And Runner

The Goose stack is deployed separately from the platform. Its external goose-gateway network connects only the hub and the platform gateway. The hub alias is goose-hub; the runner is reachable only on the private internal network.

1. Create goose-gateway if it is absent.
2. Build the run image with docker build -t goose-run:v2026.4 runimage.
3. Register runsc following [gVisor Install](10-gvisor-install.md). This requires the server owner to authenticate sudo. Never substitute the default runtime in production.
4. Run docker compose -f deploy/compose.yaml up -d --build from the Goose repository.
5. Validate the platform gateway route and query /goose/health. A ready runner reports up with free slots.
6. Submit hello from the public playground and verify stdout, exit code and backend.

## Partial Rollout

If sudo authentication is unavailable, the hub can be published first with docker compose -f deploy/compose.yaml up -d --build hub. Without the runner, it answers unavailable for runs and runner down for health, allowing the existing browser fallback contract to work. The primary is not ready until runsc and the runner have been verified.

## Example

- Input: Hub published, runner waiting for gVisor installation, public browser hello program.
- Steps: Primary POST returns 503 unavailable, browser calls Vercel fallback, an isolated Sandbox runs the program.
- Expected result: Hello output appears with backup server status. After the runner is published, subsequent runs use the primary without changing the browser.

- Design: [Hub Run](../design/run/20-hub-run.md).

## Completed Rollout

Verified on 2026-11-08: hub and runner are running, the run image builds on the server Docker builder, runsc is registered and the warm pool uses gVisor with no network and UID 10001. Public health reports runner up and two free slots. The public browser hello run exits with code 0 and shows server output. Existing application containers retained their IDs across Docker reload.

All 32 release samples were checked with production isolation flags. The 18 bundled CLI samples remain valid. See [Samples Scenarios](../testing/scenarios/web/20-samples.md) for every result.
