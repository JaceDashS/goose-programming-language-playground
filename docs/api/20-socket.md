# Session Socket

`wss://api.jace-s.com/goose/session`, opened by the playground tab when the user presses Connect AI.

- Schema: `schema/socket-message.schema.json` (copy of the jace-s platform source)
- Spec: [AI Connection](../specs/web/40-ai-connection.md); hub side in the jace-s platform (`docs/specs/goose/30-agent-session.md`)
- Design: [AI Connection Design](../design/web/40-ai-connection.md#session-client)
- Architecture: [Data Flow](../architecture/20-data-flow.md#agent-session)
- MCP tools: [Agent Mode](../architecture/10-overview.md#agent-mode); full contract in the jace-s platform (`docs/api/apps/goose/30-mcp.md`)

## Connection

- Only the origin `https://goose-playground.jace-s.com` is accepted; others get 403 before the upgrade.
- The browser sends `start` within 10 seconds. The hub answers `hello` or `sessionEnded` with the reason.
- When the jace-s login cookie of `api.jace-s.com` is present and valid, the session gets the logged-in lifetime.
- The hub pings every 20 seconds. Closing the socket ends the session.

## Messages

Every message is a JSON object with a `type`. The list is a fixed allow-list: the receiver drops anything else, and the browser never executes code it receives.

| Type | Direction | Fields | Purpose |
| --- | --- | --- | --- |
| `start` | browser to hub | `turnstileToken` (optional) | First message; a fresh Turnstile token when Turnstile is on |
| `hello` | hub to browser | `sessionToken`, `loggedIn`, `idleSeconds`, `expiresAt` | Token for the starter prompt and its lifetime |
| `setCode` | hub to browser | `code` | AI `set_code`: replace the editor content |
| `getCode` | hub to browser | `requestId` | Ask for the editor content (AI `get_code`, `run`, `check`) |
| `codeSnapshot` | browser to hub | `requestId`, `code` | Answer to `getCode`, within 5 seconds |
| `runStarted` | hub to browser | none | AI `run` started |
| `runFinished` | hub to browser | `result` (RunResult) | Show the AI run's output |
| `checkStarted` | hub to browser | none | AI `check` started |
| `checkFinished` | hub to browser | `result` (CheckResult) | Show the AI check's diagnostics |
| `toolFailed` | hub to browser | `tool`, `message` | A started run or check ended without a result |
| `aiActivity` | hub to browser | `tool` | The AI called a session tool; drives the AI connected indicator |
| `sessionEnded` | hub to browser | `reason` | The token no longer works; the socket closes next |
| `disconnect` | browser to hub | none | Revoke the token now |

`sessionEnded` reasons: `idle`, `expired`, `full`, `ip_limit`, `account_limit`, `turnstile_failed`, `shutdown`.

## Example

- Input: The AI calls `set_code(token, "fn main() { print(2); }")` and then `run(token)`.
- Steps: hub sends `aiActivity` and `setCode` → editor updates → `aiActivity` and `getCode` → browser answers `codeSnapshot` → `runStarted` → runner runs → `runFinished`.
- Result: The user sees the new code and output `2`; the AI receives the same RunResult.
