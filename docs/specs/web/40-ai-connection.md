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
- Setup help lists the MCP URL with a Copy button and how to register it in claude.ai, ChatGPT, Claude Code and Codex.
- Starter prompt (goose D-0039), four lines:

```
You are connected to my Goose Playground editor through the "goose-playground" MCP server (https://api.jace-s.com/goose/mcp).
Session token: <TOKEN>
Call goose_docs first (topic "playground", then "tutorial"). Write code with set_code, then use check and run.
Edit the code in my editor; do not paste code into the chat.
```

## Example

- Input: The user presses Connect AI, copies the starter prompt into Claude Code and asks for the first three squares.
- Steps: The AI calls `set_code`, `check` and `run` with the token.
- Result: The editor shows the AI's program, the output panel shows "AI · Exited with code 0" and `1 4 9`, and the panel says "AI connected: ran the code at 01:28".
