# AI Connection

The AI connection panel lets Claude, ChatGPT, Claude Code or Codex edit, check and run code in this tab through MCP. The hub side (session lifetimes, MCP tools, run limits) is specified in the jace-s platform (`docs/specs/goose/30-agent-session.md`).

- Design: [AI Connection Design](../../design/web/40-ai-connection.md)
- API: [Session Socket](../../api/20-socket.md)
- Scenarios: [AI Connection Scenarios](../../testing/scenarios/web/40-ai-connection.md)

## Requirements

- Opening the page opens no session. The user presses Connect AI; the button is disabled while the service state is not Normal or the hub reports no free AI connection.
- When Turnstile is built in, the connection sends a fresh Turnstile token first.
- Connected, the panel shows the starter prompt with the session token and a Copy button, the AI status (waiting, or the last action and its time), when the connection ends (idle time, latest end time, closing the tab), and Disconnect.
- Logged out, the panel offers Log in for up to 8 hours; logged in, it says a connection lasts up to 8 hours. The lifetime is fixed when the connection opens.
- The AI can replace the editor content (shown at once), read it, and run or check it. AI results appear in the output panel marked "AI"; while the AI runs or checks, the panel says so. A failed AI run shows the hub's message.
- The tab executes nothing it receives. Unknown or malformed messages are dropped.
- When the session ends, the panel explains why (idle, maximum time, server full, per-network or per-account limit, browser check failed, server restart, connection lost) and offers Connect again.
- The starter prompt is meant for an AI agent that runs commands in the user's own terminal (Claude Code, Codex). It describes the hub endpoint as a plain HTTP API called with curl, so no MCP registration is needed (D-0048). Chat apps and cloud sessions cannot send the requests, because their sandboxes block outside connections; the panel says so. When the AI cannot reach the editor, the prompt makes it say why, point chat users to an agent mode, and give the program in one code block to copy (D-0049).
- The prompt states rules for the whole conversation: every request, including follow-ups, goes into the editor with set_code, check and run; no source files in the agent's folder and no code in the chat; tests live inside the one program and print PASS or FAIL; one call at a time; ask for a new token when it is invalid. Its first step only confirms the connection ("Connected" and the first editor line) and waits.
- "How to use it" (open until the AI first calls a tool) lists the three steps: new terminal agent session, paste and wait for "Connected", ask for a program and allow curl. Registering the MCP server stays optional.
- Everything on the page is English whatever the browser language is: times use an English format (05:51 AM), Google's button and the Turnstile widget are set to English, and the login form shows its own message for empty fields instead of the browser's validation text.
- The full prompt text is `starterPrompt()` in `frontend/src/lib/agentSession.ts`; the API address comes from `endpoints.mcp`.

## Example

- Input: The user presses Connect AI, copies the starter prompt into Claude Code and asks for the first three squares.
- Steps: The AI calls `set_code`, `check` and `run` with the token.
- Result: The editor shows the AI's program, the output panel shows "AI · Exited with code 0" and `1 4 9`, and the panel says "AI connected: ran the code at 01:28".

## Per Call Editing Lock

- Lock manual editing, sample selection and Run including keyboard shortcuts only during an individual AI get_code, set_code, run or check operation. Show a visible reason, including at narrow widths.
- Acknowledge toolStarted only after synchronously guarding manual editing and execution. Refuse when a browser run is already in progress.
- Unlock on matching toolFinished, sessionEnded, socket loss or Disconnect. An unrelated failure or stale finish must not unlock an active call.
- Show every toolFailed reason independently of active output, including quota failures before execution and refused writes. The hub returns the same reason to the AI.
- Ignore editor read or replacement messages outside a tool lock. Do not load shared URL code over an active AI operation.
- Example input: AI runs while the user tries to select a sample or press Ctrl+Enter.
- Example steps: Disable sample and Run controls and make the editor read-only; finish the AI call.
- Expected result: No browser run or code replacement until the matching completion; controls become available afterward.
