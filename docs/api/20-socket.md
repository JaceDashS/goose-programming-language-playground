# Session Socket

Status: draft, awaiting confirmation. The agent session itself is implemented later.

- Schema: `schema/socket-message.schema.json`
- Architecture: [Data Flow](../architecture/20-data-flow.md#agent-session)

## Messages

Every message is a JSON object with a `type`. The list is a fixed allow-list: the receiver drops anything else, and the browser never executes code it receives.

| Type | Direction | Fields | Purpose |
| --- | --- | --- | --- |
| `hello` | hub to browser | `sessionToken` | Issued right after connect; goes into the starter prompt |
| `setCode` | hub to browser | `code` | AI `set_code`: replace the editor content |
| `getCode` | hub to browser | `requestId` | AI `get_code`: ask for the editor content |
| `codeSnapshot` | browser to hub | `requestId`, `code` | Answer to `getCode` |
| `runStarted` | hub to browser | none | AI `run` started |
| `runFinished` | hub to browser | `result` (RunResult) | Show the AI run's output |
| `aiActivity` | hub to browser | `connected` | AI connected indicator |
| `disconnect` | browser to hub | none | Revoke the token now |

## Example

- Input: The AI calls `set_code(token, "fn main() { print(2); }")` and then `run(token)`.
- Steps: hub sends `setCode` → editor updates → hub sends `runStarted` → runner runs → hub sends `runFinished`.
- Result: The user sees the new code and output `2`; the AI receives the same RunResult.
