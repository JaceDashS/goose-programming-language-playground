# Glossary

## Goose
- Definition: The language this playground targets (github.com/aardappel/goose). The compiler is written in C++20 and emits C. `goose run` compiles and runs a program in-process with the bundled TinyCC.
- Note: This is a different project from Block's "goose" AI agent. Do not confuse them.

## Runner
- Definition: A program on the on-prem server, written in Go. It receives code and runs `goose run` in a throwaway gVisor container. It is the only component with Docker privileges.
- Avoid: "compiler" (the Goose compiler is a different thing that runs inside the container), "executor"

## Hub
- Definition: The internet-facing Go service on the on-prem server. It handles browser WebSockets, the MCP endpoint, quotas, and service state. It has no Docker privileges and only sends run requests to the runner.
- Avoid: "socket server", "MCP server" (use these only for the hub's individual roles)

## Run Container
- Definition: A gVisor (runsc) container created for one run and deleted when it ends. Runs never share containers, even for the same user.
- Example: A user who presses Run twice gets two different containers, each with its own kernel.

## gVisor
- Definition: A container runtime that puts a user-space kernel between the container and the host kernel. User code's kernel requests are handled by this fake kernel first, so a host kernel bug is hard to reach from inside the container.
- Code: Docker runtime name `runsc`

## Warm Pool
- Definition: Run containers the runner starts in advance and keeps waiting, so a run does not pay container startup time (~0.8 s measured).
- Example: With 2 waiting containers, the user's run uses one immediately, and the runner starts a replacement in the background.

## Fallback
- Definition: When the on-prem server is busy or down, the browser calls the Vercel `/api/run` endpoint, which runs the code in Vercel Sandbox.
- Note: This is cloud bursting (overflow) plus failover, not even load balancing. The agent mode does not fall back.

## Session Token
- Definition: A random 64-character token the hub issues after the user presses Connect AI. It is included in the AI starter prompt, and MCP tools use it to find the user's browser session.
- Code: `hello.sessionToken` in `frontend/src/lib/agentSession.ts`.
- Note: Anyone who has the token can control that session's editor. It ends when the tab closes or disconnects, after the idle time without MCP calls, or at its maximum time.

## Starter Prompt
- Definition: The text a user copies from the playground and pastes into Claude or ChatGPT. It contains the session token and how to use the MCP tools.

## Service State
- Definition: The playground's availability level shown to the user: Normal, Degraded, or Outage.
- Normal: On-prem is available, so both the AI agent and runs work.
- Degraded: On-prem is busy or down. The AI agent is unavailable; runs go to the Vercel fallback.
- Outage: Both on-prem and Vercel are unavailable. Only the editor works.

## Run Result
- Definition: The outcome of one run, with output and compiler diagnostics. The same shape comes from the runner, the hub and the Vercel fallback.
- Code: `RunResult` (`frontend/src/lib/contract.ts`), `schema/run-result.schema.json` (copy of the platform schema)
- Example: A program that does not compile returns `outcome: "compile_error"` with a diagnostic at the failing line, and nothing runs.

## Run Slot
- Definition: One of the runner's concurrent run places (2 by default). When all are in use, the hub answers `busy` and the browser falls back.
- Avoid: "worker" (Goose uses that word for its threads)

## Sample
- Definition: An unmodified Goose release program bundled as static editor text.
- Code: frontend/src/samples/index.ts


## Run Counter
- Definition: Atomic admission accounting for sandbox runs in UTC hourly and daily windows.
- Code: RunCounter, MemoryRunCounter
- Note: The initial implementation shares counts within one server process.

## Turnstile Token
- Definition: A single-use proof from Cloudflare Turnstile that a run request came from a real browser. The hub and the fallback verify it only when their `TURNSTILE_SECRET` is set.
- Code: `frontend/src/lib/turnstile.ts`, `RunRequest.turnstileToken`.
- Example: After the hub spends a token and answers `busy`, the page gets a new token for `/api/run`.

## Tool Lock
- Definition: Temporary exclusive ownership of one tab's editing and execution controls for one AI session tool call, acknowledged by that tab.
- Code: `toolStarted`, `toolReady`, `toolFinished` in the session socket contract.
- Related: [Session Socket](api/20-socket.md).
- Example: An AI run locks the editor until its matching completion; a parallel refused call does not unlock it.
