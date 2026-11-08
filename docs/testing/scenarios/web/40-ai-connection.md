# AI Connection Scenarios

## AI Connection Scenarios

- Design: [AI Connection Design](../../../design/web/40-ai-connection.md)

Hub-side scenarios (lifetimes, caps, MCP tools, run limits) live in the jace-s platform (`docs/testing/scenarios/goose/30-agent-session.md`).

### No Session Until Connect
- Input: The page loads with the hub Normal.
- Steps: The panel shows Connect AI; nothing else happens until it is pressed; then the socket opens and sends `start`.
- Expected result: No socket before the click. After `hello`, the starter prompt contains the token and the MCP URL, and the status says the panel is waiting for the AI.
- Test: `frontend/src/components/AiPanel.test.tsx` → "opens no socket until Connect AI, then shows the starter prompt with the token"; `agentSession.test.ts` → "sends start with a Turnstile token and reports the session".

### AI Edits Reads And Runs
- Input: Hub messages `aiActivity(set_code)`, `setCode`, `getCode`, `runStarted`, `runFinished`, `checkFinished` with a diagnostic at 1:23.
- Steps: The editor is replaced; `codeSnapshot` returns the new content; the output panel shows the AI's progress and results.
- Expected result: "AI connected: changed the code", "AI is running the code…", "AI · Exited with code 0", then "AI · Compile error" with "line 1:23: expression expected". Checked in Edge on 2026-11-09 against a local hub, runner and run image with an MCP client acting as the AI: the editor showed the AI's program and the output `1 4 9`.
- Test: `AiPanel.test.tsx` → "lets the AI replace and read the editor and shows its run"; `agentSession.test.ts` → "applies setCode, answers getCode with the editor and shows results".

### Messages Outside The Allow List
- Input: Text that is not JSON, `{"type":"eval","code":"alert(1)"}`, `setCode` with a number.
- Expected result: All dropped; the editor is unchanged and nothing runs.
- Test: `agentSession.test.ts` → "drops anything outside the allow-list", `parseHubMessage` tests.

### Disconnect And Ended Sessions
- Input: The user presses Disconnect; in another connection the hub sends `sessionEnded(idle)`; in a third the socket just closes.
- Expected result: Disconnect sends `disconnect`, closes the socket and returns to Connect AI; the ended connection shows "The AI connection ended because the AI made no calls for a while." with Connect again; a plain close shows that the connection was lost. In Edge, an MCP call with the disconnected token was refused with the "token is not valid" message.
- Test: `AiPanel.test.tsx` → "disconnects on request and explains an ended session"; `agentSession.test.ts` → "ends with the hub's reason, or lost when the socket just closes", "disconnect revokes the token and returns to idle".

### Browser Check Fails Before Start
- Input: Turnstile is built in and cannot produce a token.
- Expected result: No `start` is sent; the panel shows that the AI connection could not start.
- Test: `agentSession.test.ts` → "ends with error when the browser check fails".

### Layout
- Input: 1280 × 900 and 390 × 844 viewports, before and after Connect AI.
- Expected result: The editor panes take the spare height; the AI panel keeps its own height; on the phone width the status and lifetime hints stay visible. Checked with Edge screenshots on 2026-11-09.
