"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Health, ServiceState } from "@/lib/contract";
import { runGoose, type RunOutcome } from "@/lib/runGoose";
import { agentAllowed, BANNER, recheckDelayMs, stateFromHealth } from "@/lib/serviceState";
import { endpoints } from "@/lib/endpoints";
import { encodeShare, decodeShare, SHARE_INVALID } from "@/lib/share";
import { samples } from "@/samples";
import OutputPanel from "./OutputPanel";
import styles from "./Playground.module.css";

const HELLO = `fn main() {
    print("Hello, Goose!");
}
`;

export default function Playground() {
  const [code, setCode] = useState(HELLO);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<ServiceState>("normal");
  const fallbackDown = useRef(false);
  const loadedCode = useRef(HELLO);
  const edited = useRef(false);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    decodeShare(window.location.hash).then(shared => {
      if (!cancelled && !edited.current && shared !== null) {
        loadedCode.current = shared;
        setCode(shared);
      }
    }).catch(() => {
      if (!cancelled) setShareMessage(SHARE_INVALID);
    });
    return () => { cancelled = true; };
  }, []);

  const share = async () => {
    try {
      const url = await encodeShare(code, window.location.href);
      window.history.replaceState(null, "", url);
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Link copied.");
      } catch {
        setShareMessage("The link is in the address bar, but could not be copied.");
      }
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "This program could not be shared.");
    }
  };

  // Recheck the hub's health on a schedule that backs off while not normal.
  useEffect(() => {
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const check = async () => {
      let h: Health | null = null;
      try {
        const res = await fetch(endpoints.health, { cache: "no-store" });
        if (res.ok) h = (await res.json()) as Health;
      } catch {
        h = null;
      }
      if (cancelled) return;
      const next = stateFromHealth(h, fallbackDown.current);
      failures = next === "normal" ? 0 : failures + 1;
      if (next === "normal") fallbackDown.current = false;
      setHealth(h);
      setState(next);
      timer = setTimeout(check, recheckDelayMs(next, failures - 1));
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const out = await runGoose(code, endpoints);
      fallbackDown.current = out.state === "outage";
      setState(out.state);
      setOutcome(out);
    } finally {
      setRunning(false);
    }
  }, [code]);

  const banner = BANNER[state];
  const canRun = state !== "outage" && !running;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Goose Playground</h1>
        <a className={styles.link} href="https://github.com/aardappel/goose" target="_blank" rel="noreferrer">
          About Goose
        </a>
      </header>

      {banner && (
        <div className={state === "outage" ? styles.bannerOutage : styles.bannerDegraded} role="status">
          {banner}
        </div>
      )}

      <div className={styles.toolbar}>
        <button
          className={styles.run}
          onClick={run}
          disabled={!canRun}
          aria-keyshortcuts="Control+Enter"
        >
          {running ? "Running…" : "Run"}
        </button>
        <label>
          Sample{" "}
          <select aria-label="Sample" value="" onChange={(e) => {
            const sample = samples.find((s) => s.name === e.target.value);
            if (!sample) return;
            if (code !== loadedCode.current && !window.confirm("Replace your code with the sample?")) return;
            edited.current = true;
            loadedCode.current = sample.code;
            setCode(sample.code);
          }}>
            <option value="" disabled>Choose a sample</option>
            {samples.map((sample) => <option key={sample.name} value={sample.name}>{sample.name}</option>)}
          </select>
        </label>
        <button onClick={share}>Share</button>
        <span role="status">{shareMessage}</span>
        <span className={styles.hint}>Ctrl+Enter</span>
      </div>

      <main className={styles.panes}>
        <section className={styles.editorPane} aria-label="Editor">
          <textarea
            className={styles.editor}
            value={code}
            onChange={(e) => { edited.current = true; setCode(e.target.value); }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canRun) {
                e.preventDefault();
                run();
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </section>
        <section className={styles.outputPane} aria-label="Output">
          <OutputPanel outcome={outcome} running={running} />
        </section>
      </main>

      <aside className={styles.aiPanel} aria-label="AI connection">
        <strong>AI connection</strong>
        <span className={styles.hint}>
          {agentAllowed(state, health) ? "Coming soon: connect Claude or ChatGPT through MCP." : "Unavailable right now."}
        </span>
      </aside>
    </div>
  );
}
