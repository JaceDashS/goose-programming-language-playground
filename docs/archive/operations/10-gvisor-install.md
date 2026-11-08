# gVisor Install

> Archived 2026-11-08: The Goose hub, runner and run image moved to the jace-s platform repository (`services/goose/`), which now owns this document. This repository keeps only the browser client.

Procedure for registering the gVisor runtime (`runsc`) with Docker on the on-prem server. The jace-s production stack runs on the same Docker daemon, so the daemon is **reloaded, never restarted**. Run it only with the server owner's approval.

- Related: [Overview](../../architecture/10-overview.md#isolation), [Code Run Design](../design/run/10-code-run.md#docker-backend)

## Steps

1. Record the current state:
   ```bash
   docker ps --format '{{.Names}} {{.Status}}' > ~/before-gvisor.txt
   sudo cp /etc/docker/daemon.json ~/daemon.json.bak 2>/dev/null || echo "no daemon.json yet"
   ```
2. Install `runsc` from the gVisor apt repository:
   ```bash
   curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
     | sudo tee /etc/apt/sources.list.d/gvisor.list
   sudo apt-get update && sudo apt-get install -y runsc
   ```
3. Register the runtime. `runsc install` adds a `runtimes.runsc` entry to `/etc/docker/daemon.json` and keeps the other keys. Compare with the backup before going on:
   ```bash
   sudo runsc install
   sudo diff ~/daemon.json.bak /etc/docker/daemon.json
   ```
4. Apply without stopping containers. `runtimes` is a live-reloadable daemon option:
   ```bash
   sudo systemctl reload docker
   docker info --format '{{json .Runtimes}}'    # must list runsc
   ```
5. Verify:
   ```bash
   docker ps --format '{{.Names}} {{.Status}}' | diff ~/before-gvisor.txt -   # only uptimes may differ
   docker run --rm --runtime runsc alpine dmesg | head -3                    # gVisor prints its own boot lines
   echo 'fn main() { print("ok"); }' | docker run --rm -i --runtime runsc --network none --read-only \
     --tmpfs /work:rw,exec,size=64m,uid=10001,gid=10001 --tmpfs /tmp:rw,exec,size=16m \
     --memory 512m --memory-swap 512m --pids-limit 64 --cap-drop ALL goose-run:v2026.4
   ```
   The last command must print `GOOSE-CHECK 0 []` and `ok`. Goose reserves several GB of address space at start; if it fails only under `runsc`, record the error before changing any limit.

## Rollback

```bash
sudo cp ~/daemon.json.bak /etc/docker/daemon.json && sudo systemctl reload docker
```

## Example

- Input: Green-G4 with Docker 29.1.3, jace-s containers running, no `runsc`.
- Steps: 1 → 5 above.
- Result: `docker info` lists `runsc`, the jace-s containers keep running with unchanged uptime, and the Goose check prints `ok` under gVisor.

## Production Verification

Verified on Green-G4 on 2026-11-08 with runsc release-20261102.0. Configuration and running container IDs were backed up before installation; the before and after container ID files match after Docker reload. Existing platform containers stayed running. The run containers report runtime runsc, network none and user 10001.

- Input: Public hello program after the primary runner starts.
- Steps: GET /goose/health reports runner up with two free slots; POST /goose/run executes inside gVisor.
- Expected result: backend onprem, outcome exited, exit code 0 and Hello, Goose output. The public browser displays server rather than backup server. A direct fallback request is refused with use_primary while capacity is free.
