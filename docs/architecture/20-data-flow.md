# Data Flow

- Structure: [Architecture Overview](10-overview.md)

## Run Request

The browser calls the on-prem hub first. The hub checks quotas and asks the runner to run the code. The runner runs it in a gVisor container from the warm pool and returns the result.

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as Hub (on-prem)
    participant R as Runner
    participant C as gVisor container
    B->>H: POST api.jace-s.com/goose/run (code, Turnstile)
    H->>H: Check CORS, Turnstile, quota
    H->>R: Run request (internal address)
    R->>C: Take a waiting container, insert code, goose run
    C-->>R: stdout, stderr, exit code, duration
    R->>C: Delete the container, start a replacement
    R-->>H: Result
    H-->>B: Result
```

Scenario:
- Input: A user runs `samples/07_sieve.goose`.
- Steps: The hub verifies → the runner uses a waiting container → `goose run` → output is returned → the container is deleted and replaced.
- Result: Wait time is roughly run time plus network round trip, with no container startup cost.

## Fallback

If on-prem answers 503 (busy) or the connection fails within the short timeout, the browser calls Vercel `/api/run`. Vercel first checks on-prem itself, and refuses with "use the primary" if on-prem is healthy and has capacity. This keeps the Sandbox quota from being consumed by direct attacks.

```mermaid
flowchart TD
    A[Run click] --> B{On-prem response}
    B -- success --> Z[Show result]
    B -- "503 / connect failure" --> C[Call Vercel /api/run]
    C --> D{On-prem actually unavailable?}
    D -- "No (healthy)" --> E[Refuse: retry primary]
    D -- Yes --> F{Sandbox quota left?}
    F -- Yes --> G[Run in Sandbox] --> Z
    F -- No --> H[Outage banner]
```

Scenario:
- Input: Two runs are already executing on-prem when a third request arrives.
- Steps: The hub returns 503 → the browser calls `/api/run` → Vercel confirms on-prem is busy → Sandbox run.
- Result: The user gets a result and sees the Degraded banner. The Sandbox quota is used only for the overflow.

## Agent Session

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as Hub
    participant AI as Claude / ChatGPT
    B->>H: WebSocket connect → session token issued
    Note over B: User copies the starter prompt (with token) into the AI
    AI->>H: MCP goose_docs / get_sample
    AI->>H: MCP set_code(token, code)
    H->>B: Socket: set editor content
    AI->>H: MCP run(token)
    H->>H: Run through the runner
    H->>B: Socket: show output
    H-->>AI: Same result
```

- The token is bound to that tab's WebSocket. When the tab closes or the user presses Disconnect, the token stops working immediately.
- Socket messages are a fixed allow-list. The browser does not execute code it receives.

## Service State Transitions

```mermaid
stateDiagram-v2
    Normal --> Degraded: on-prem busy or down
    Degraded --> Normal: on-prem recovers
    Degraded --> Outage: Vercel also unavailable
    Outage --> Degraded: Vercel recovers
    Outage --> Normal: on-prem recovers
```

The browser rechecks the hub health endpoint and the socket connection with backoff and switches state automatically.
