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

Implementation: [Vercel Fallback Design](../design/run/30-vercel-fallback.md). The provisional quota counter is shared within a process; a durable cross-instance store remains open.

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
    B->>H: Connect AI: WebSocket, start(Turnstile token)
    H->>H: Login cookie? ask the jace-s api (no renewal)
    H->>B: hello(token, lifetime)
    Note over B: User copies the starter prompt (with token) into the AI
    AI->>H: MCP goose_docs / get_sample
    AI->>H: MCP set_code(token, code)
    H->>B: Socket: setCode
    AI->>H: MCP run(token)
    H->>B: Socket: getCode
    B->>H: codeSnapshot (editor content)
    H->>H: Run through the runner (MCP quota)
    H->>B: Socket: runFinished
    H-->>AI: Same result
```

- The token is bound to that tab's WebSocket. When the tab closes or the user presses Disconnect, the token stops working immediately; it also ends after the idle or maximum time.
- `run` and `check` run what is in the editor, read from the tab at call time.
- Socket messages are a fixed allow-list. The browser does not execute code it receives.
- Example: the AI calls `run` while the tab is in the background and does not answer within 5 s → the AI is told the tab did not answer → nothing runs and nothing is counted.

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

## Tool Call Ownership

Every session tool first sends toolStarted; the tab locks manual editing and execution and replies toolReady. After a result or failure, matching toolFinished releases the lock. A browser run already in progress refuses the acknowledgement. Closing the connection releases the local lock. See [AI Connection Design](../design/web/40-ai-connection.md#lock-and-refusal-handling).

```mermaid
sequenceDiagram
    participant AI
    participant H as Hub
    participant B as Browser
    AI->>H: Session tool
    H->>B: toolStarted with ID
    B->>H: toolReady accepted
    H->>B: Code action or execution result
    H->>B: toolFinished with ID
    H-->>AI: Result or shared refusal reason
```
