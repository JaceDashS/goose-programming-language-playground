"use client";

import { useState } from "react";
import { END_MESSAGE, starterPrompt, type AgentState } from "@/lib/agentSession";
import { endpoints } from "@/lib/endpoints";
import styles from "./Playground.module.css";

interface Props {
  state: AgentState;
  /** Whether the server can take a new AI connection now. */
  available: boolean;
  loggedIn: boolean;
  onConnect(): void;
  onDisconnect(): void;
  onLogin(): void;
}

const TOOL_LABEL: Record<string, string> = {
  get_code: "read the code",
  set_code: "changed the code",
  run: "ran the code",
  check: "checked the code",
};

/** The page is English, so times use an English format whatever the browser language is (05:51 AM). */
export function time(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function duration(seconds: number): string {
  return seconds >= 3600 ? `${Math.round(seconds / 3600)} h` : `${Math.round(seconds / 60)} min`;
}

async function copy(text: string, done: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    done("Copied.");
  } catch {
    done("Could not copy; select the text and copy it.");
  }
}

/** The AI connection panel: connect, the starter prompt, status and setup help. */
export default function AiPanel({ state, available, loggedIn, onConnect, onDisconnect, onLogin }: Props) {
  const [message, setMessage] = useState("");

  // The starter prompt describes an HTTP API, so a terminal agent needs no setup; chat apps cannot
  // send the requests from their sandboxes (goose D-0048).
  const help = (open: boolean) => (
    <details className={styles.setup} open={open}>
      <summary>How to use it</summary>
      <ol>
        <li>Open a new session of an AI agent that runs commands in your own terminal, such as Claude Code or Codex.</li>
        <li>Paste the starter prompt and wait until the agent replies &quot;Connected to your Goose Playground&quot;.</li>
        <li>
          Ask for a program. The agent asks to run curl or a short script; allow it. Codex runs commands in a sandbox
          without internet access, so approve running the request outside the sandbox when it asks.
        </li>
      </ol>
      <p>
        Chat apps (ChatGPT, claude.ai) and cloud sessions cannot send these requests, because their sandboxes block
        outside connections.
      </p>
      <p>
        Optional: AI apps with MCP support can also add the server <code>{endpoints.mcp}</code>{" "}
        <button type="button" className={styles.small} onClick={() => copy(endpoints.mcp, setMessage)}>Copy URL</button>
      </p>
    </details>
  );

  if (state.status === "connected") {
    const prompt = starterPrompt(state.token, endpoints.mcp);
    const activity = state.lastTool && state.lastActivity
      ? `AI connected: ${TOOL_LABEL[state.lastTool]} at ${time(state.lastActivity)}.`
      : "Waiting for the AI. Paste the starter prompt into a new Claude Code or Codex session in your terminal.";
    return (
      <aside className={styles.aiPanel} aria-label="AI connection">
        <div className={styles.aiHead}>
          <strong>AI connection</strong>
          <span className={state.lastTool ? styles.aiLive : styles.hint} role="status">{activity}</span>
          <button type="button" className={styles.share} onClick={onDisconnect}>Disconnect</button>
        </div>
        <label className={styles.field}>
          <span>Starter prompt</span>
          <textarea className={styles.prompt} readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className={styles.aiHead}>
          <button type="button" className={styles.run} onClick={() => copy(prompt, setMessage)}>Copy starter prompt</button>
          <span className={styles.hint} role="status">{message}</span>
        </div>
        <p className={styles.hint}>
          Ends after {duration(state.idleSeconds)} without AI activity, at {time(state.expiresAt)} at the latest, or when you close this tab.
          {!state.loggedIn && <>{" "}<button type="button" className={styles.linkButton} onClick={onLogin}>Log in</button> for up to 8 hours.</>}
        </p>
        {help(!state.lastTool)}
      </aside>
    );
  }

  const ended = state.status === "ended" ? END_MESSAGE[state.reason] : "";
  return (
    <aside className={styles.aiPanel} aria-label="AI connection">
      <div className={styles.aiHead}>
        <strong>AI connection</strong>
        <span className={styles.hint}>
          {available ? "Let an AI agent in your terminal (Claude Code or Codex) write, check and run code in this editor." : "Unavailable right now."}
        </span>
        <button type="button" className={styles.run} onClick={onConnect} disabled={!available || state.status === "connecting"}>
          {state.status === "connecting" ? "Connecting…" : state.status === "ended" ? "Connect again" : "Connect AI"}
        </button>
      </div>
      {ended && <p className={styles.warning} role="status">{ended}</p>}
      <p className={styles.hint}>
        {loggedIn ? "Logged in: a connection lasts up to 8 hours." : "Without logging in a connection lasts up to 2 hours."}
      </p>
      {help(false)}
      <span className={styles.hint} role="status">{message}</span>
    </aside>
  );
}
