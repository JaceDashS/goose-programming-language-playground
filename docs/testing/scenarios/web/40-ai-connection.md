# AI Connection Test Cases

## AI Connection Scenarios

- Design: [AI Connection Design](../../../design/web/40-ai-connection.md)

Hub-side scenarios (lifetimes, caps, MCP tools, run limits) live in the jace-s platform (`docs/testing/scenarios/goose/30-agent-session.md`).

### No Session Until Connect
- Input: The page loads with the hub Normal.
- Steps: The panel shows Connect AI; nothing else happens until it is pressed; then the socket opens and sends `start`.
- Expected result: No socket before the click. After `hello`, the starter prompt contains the token and the MCP URL, and the status says the panel is waiting for the AI.
- Test: `frontend/src/components/AiPanel.test.tsx` → "opens no socket until Connect AI, then shows the starter prompt with the token"; `agentSession.test.ts` → "sends start with a Turnstile token and reports the session".

### AI Edits Reads And Runs
- Input: Hub messages `aiActivity(set_code)`, `toolStarted`, `setCode`, `getCode`, `runStarted`, `runFinished`, `checkFinished` with a diagnostic at 1:23.
- Steps: Acknowledge the per-call lock before replacement or reading; the editor is replaced; `codeSnapshot` returns the new content; the output panel shows the AI's progress and results; matching completion unlocks.
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

### Browser Check Before The Socket
- Input: Turnstile is built in; the check takes longer than 10 seconds, fails, or the user presses Disconnect while it is pending.
- Steps: The token is requested before the socket opens; the socket opens only with a token in hand and sends `start` at once.
- Expected result: A slow check still connects; a failed check shows that the AI connection could not start and opens no socket; Disconnect during the check opens no socket. Found in production on 2026-11-09: with the socket opened first, a check slower than 10 s let the hub close the socket after 10.003 s and the panel showed "connection lost".
- Test: `agentSession.test.ts` → "gets the Turnstile token before opening the socket, then sends start and reports the session", "ends with error when the browser check fails", "opens no socket when Disconnect comes before the browser check finishes".

### Layout
- Input: 1280 × 900 and 390 × 844 viewports, before and after Connect AI.
- Expected result: The editor panes take the spare height; the AI panel keeps its own height; on the phone width the status and lifetime hints stay visible. Checked with Edge screenshots on 2026-11-09.

### Manual Controls During AI Calls
- Input: A locked AI run, manual edits, sample selection, mouse Run and Ctrl+Enter.
- Steps: Try each control; deliver a refusal for a different AI call and a stale finish; finish the owning call.
- Expected result: No manual mutation or browser execution; explanation stays visible; unrelated events retain the lock; all controls work after the matching finish.
- Test: `AiPanel.test.tsx` → "locks editing, sample replacement and mouse or keyboard runs only for the active AI call"; `agentSession.test.ts` → "acknowledges one lock and ignores unrelated failures and stale unlocks".

### Failure Cleanup And Connection Loss
- Input: A quota refusal before check starts; separately, an active get_code followed by socket loss, sessionEnded or Disconnect.
- Steps: Display the quota reason; process matching finish or connection termination.
- Expected result: The refusal is visible even without runStarted; controls unlock and the next manual operation is possible.
- Test: `AiPanel.test.tsx` → "shows pre-execution quota failures and unlocks on failure cleanup or disconnection"; `agentSession.test.ts` → "rejects the lock when the browser is busy and releases accepted locks on connection end".

### Browser Execution Already In Progress
- Input: A pending browser run followed by AI set_code.
- Steps: Refuse toolStarted with accepted false; show the shared busy reason; finish the browser run.
- Expected result: No AI edit; browser output is preserved and has no AI label.
- Test: `AiPanel.test.tsx` → "refuses AI edits during a browser run without replacing that run's output".

### Prompt In A Chat App
- Input: The user pastes the starter prompt into a chat app (ChatGPT, claude.ai) that has no terminal, then asks for a program.
- Steps: The chat cannot POST to the hub: earlier prompts led ChatGPT's code sandbox to a DNS failure with no request at the gateway, and claude.ai answered that it has no terminal or HTTP POST (2026-11-09). A GET bridge test also failed, because chat fetch refuses URLs the AI builds itself (platform D-0254).
- Expected result: The AI says why it could not reach the editor, tells the user that the prompt needs an agent mode with a terminal such as Claude Code or Codex, and gives the whole program in one code block to copy into the editor, marked as not checked or run. The same explanation and code block follow when a call fails later (invalid token, busy, no answer); an invalid token also asks for a new one.
- Test: `agentSession.test.ts` → "starter prompt gives the token, the curl API and rules that hold for follow-up requests".

### Terminal Agent Without MCP Registration
- Input: A new Claude Code session on the user's PC with no MCP server registered; the starter prompt pasted, then "implement Dijkstra with test code".
- Steps: The agent confirms the connection with goose_docs and get_code, then for each request posts set_code, check and run to the hub endpoint with curl.
- Expected result: "Connected to your Goose Playground." with the editor summary first; the Dijkstra program with in-program tests appears in the editor and its PASS lines in the output panel. Checked by the user on 2026-11-09 (an earlier prompt without conversation-wide rules let the second request bypass the editor: no call reached the hub).
- Test: `agentSession.test.ts` → "starter prompt gives the token, the curl API and rules that hold for follow-up requests"; `AiPanel.test.tsx` → "explains the terminal agent workflow and keeps MCP optional".

### English Page In A Korean Browser
- Input: A browser with Korean as its language, an AI action at 05:51 local time, a login attempt with empty fields.
- Expected result: "AI connected: ran the code at 05:51 AM." with no Korean text anywhere on the page; Google's button and the browser check in English; "Enter your username and password." instead of the browser's message. Checked in Edge with locale ko-KR on 2026-11-09 against a local hub.
- Test: `AiPanel.test.tsx` → "formats times in English whatever the browser language is", "asks for both login fields in English instead of the browser's validation message".

### Real Terminal Agents
- Input: The panel's starter prompt from a connected local tab (local hub, runner and run image) plus "implement a function that returns the first n square numbers, with tests in the program", given to Claude Code (`claude -p`, empty folder) and to Codex 0.167 (`codex exec`) on Windows.
- Steps: Each agent confirms the connection, reads the docs, posts set_code, check and run with curl.
- Expected result: Both reply "Connected" with the first editor line (the first step before D-0052), put the program in the editor and report five PASS lines and "5/5 tests passed"; Claude Code leaves no files in its folder. Codex chose PowerShell with curl.exe on its own. Observed on 2026-11-09.
- Codex limit: its Windows sandbox blocks outside addresses (`curl https://api.jace-s.com/...` exits at once; `sandbox_workspace_write.network_access=true` did not change it), while local addresses work. Outside the sandbox the same command returns the health JSON. The panel therefore tells Codex users to approve running the request outside the sandbox.
