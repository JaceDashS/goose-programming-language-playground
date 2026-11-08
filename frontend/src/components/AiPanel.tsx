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

function time(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  // The prompt alone does nothing: the AI needs the MCP server added and turned on in that chat.
  const setup = (open: boolean) => (
    <details className={styles.setup} open={open}>
      <summary>Step 1: add the MCP server to your AI (once) and turn it on in the chat</summary>
      <p>
        Server URL: <code>{endpoints.mcp}</code>{" "}
        <button type="button" className={styles.small} onClick={() => copy(endpoints.mcp, setMessage)}>Copy URL</button>
      </p>
      <ul>
        <li>claude.ai: Settings → Connectors → Add custom connector, with this URL. No sign-in is needed.</li>
        <li>
          ChatGPT (web): Settings → Apps &amp; Connectors → Advanced settings → turn on Developer mode → Create, with this URL
          and No authentication. Then, in each chat, open + → Developer mode and turn on goose-playground. Menu names differ
          between ChatGPT versions.
        </li>
        <li>Claude Code: <code>claude mcp add --transport http goose-playground {endpoints.mcp}</code></li>
        <li>Codex: <code>codex mcp add goose-playground --url {endpoints.mcp}</code></li>
      </ul>
      <p>Pasting only the starter prompt is not enough: if the AI does not list the goose-playground tools, it is not connected yet.</p>
    </details>
  );

  if (state.status === "connected") {
    const prompt = starterPrompt(state.token, endpoints.mcp);
    const activity = state.lastTool && state.lastActivity
      ? `AI connected: ${TOOL_LABEL[state.lastTool]} at ${time(state.lastActivity)}.`
      : "Waiting for the AI. Step 2: paste the starter prompt into a chat where the goose-playground server is on, then ask for a program.";
    return (
      <aside className={styles.aiPanel} aria-label="AI connection">
        <div className={styles.aiHead}>
          <strong>AI connection</strong>
          <span className={state.lastTool ? styles.aiLive : styles.hint} role="status">{activity}</span>
          <button type="button" className={styles.share} onClick={onDisconnect}>Disconnect</button>
        </div>
        <label className={styles.field}>
          <span>Starter prompt</span>
          <textarea className={styles.prompt} readOnly value={prompt} rows={6} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className={styles.aiHead}>
          <button type="button" className={styles.run} onClick={() => copy(prompt, setMessage)}>Copy starter prompt</button>
          <span className={styles.hint} role="status">{message}</span>
        </div>
        <p className={styles.hint}>
          Ends after {duration(state.idleSeconds)} without AI activity, at {time(state.expiresAt)} at the latest, or when you close this tab.
          {!state.loggedIn && <>{" "}<button type="button" className={styles.linkButton} onClick={onLogin}>Log in</button> for up to 8 hours.</>}
        </p>
        {setup(!state.lastTool)}
      </aside>
    );
  }

  const ended = state.status === "ended" ? END_MESSAGE[state.reason] : "";
  return (
    <aside className={styles.aiPanel} aria-label="AI connection">
      <div className={styles.aiHead}>
        <strong>AI connection</strong>
        <span className={styles.hint}>
          {available ? "Let Claude or ChatGPT write, check and run code in this editor." : "Unavailable right now."}
        </span>
        <button type="button" className={styles.run} onClick={onConnect} disabled={!available || state.status === "connecting"}>
          {state.status === "connecting" ? "Connecting…" : state.status === "ended" ? "Connect again" : "Connect AI"}
        </button>
      </div>
      {ended && <p className={styles.warning} role="status">{ended}</p>}
      <p className={styles.hint}>
        {loggedIn ? "Logged in: a connection lasts up to 8 hours." : "Without logging in a connection lasts up to 2 hours."}
      </p>
      {setup(false)}
      <span className={styles.hint} role="status">{message}</span>
    </aside>
  );
}
