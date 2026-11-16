"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Health, ServiceState } from "@/lib/contract";
import { runGoose } from "@/lib/runGoose";
import { connectAgent, type AgentConnection, type AgentState, type AgentTool } from "@/lib/agentSession";
import { createAccountClient, type AccountUser } from "@/lib/account";
import { agentAllowed, BANNER, stateFromHealth } from "@/lib/serviceState";
import { endpoints } from "@/lib/endpoints";
import { encodeShare, decodeShare, SHARE_INVALID } from "@/lib/share";
import { samples } from "@/samples";
import { createTurnstileWidget, loadTurnstile, turnstileSiteKey, type TurnstileWidget } from "@/lib/turnstile";
import OutputPanel, { type PanelOutcome } from "./OutputPanel";
import AiPanel from "./AiPanel";
import FeedbackDialog from "./FeedbackDialog";
import LoginDialog from "./LoginDialog";
import styles from "./Playground.module.css";

const HELLO = `fn main() {
    print("Hello, Goose!");
}
`;

const account = createAccountClient(endpoints.account);

async function fetchHubHealth(): Promise<Health | null> {
  try {
    const res = await fetch(endpoints.health, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

export default function Playground() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [code, setCode] = useState(HELLO);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<PanelOutcome | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiLock, setAiLock] = useState<AgentTool | null>(null);
  const aiLockRef = useRef<AgentTool | null>(null);
  const browserRunning = useRef(false);
  const [aiNotice, setAiNotice] = useState("");
  const [byAI, setByAI] = useState(false);
  const [agent, setAgent] = useState<AgentState>({ status: "idle" });
  const connection = useRef<AgentConnection | null>(null);
  const codeRef = useRef(HELLO);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<ServiceState>("normal");
  const fallbackDown = useRef(false);
  const primaryDown = useRef(false);
  const [checkingAI, setCheckingAI] = useState(false);
  const [aiConnectError, setAiConnectError] = useState("");
  const loadedCode = useRef(HELLO);
  const edited = useRef(false);
  const [shareMessage, setShareMessage] = useState("");
  const siteKey = turnstileSiteKey();
  const turnstileBox = useRef<HTMLDivElement>(null);
  const turnstile = useRef<Promise<TurnstileWidget> | null>(null);

  // Turnstile is on only when a site key is built in. Without it, runs carry no token.
  useEffect(() => {
    const box = turnstileBox.current;
    if (!siteKey || !box) return;
    const ready = loadTurnstile().then(api => createTurnstileWidget(api, box, siteKey));
    ready.catch(() => undefined);
    turnstile.current = ready;
    return () => {
      turnstile.current = null;
      ready.then(widget => widget.dispose(), () => undefined);
    };
  }, [siteKey]);

  // The AI reads the editor through the session socket; keep the latest content at hand.
  useEffect(() => { codeRef.current = code; }, [code]);

  useEffect(() => {
    let cancelled = false;
    account.session().then((u) => { if (!cancelled) setUser(u); }, () => undefined);
    return () => { cancelled = true; };
  }, []);

  // Closing the tab closes the socket, which ends the session on the hub.
  useEffect(() => () => connection.current?.disconnect(), []);

  useEffect(() => {
    let cancelled = false;
    decodeShare(window.location.hash).then(shared => {
      if (!cancelled && !edited.current && !aiLockRef.current && shared !== null) {
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

  const applyHealth = useCallback((h: Health | null) => {
    const next = stateFromHealth(h, fallbackDown.current);
    if (next === "normal") fallbackDown.current = false;
    primaryDown.current = next !== "normal";
    setHealth(h);
    setState(next);
    return { health: h, state: next };
  }, []);

  const checkHealth = useCallback(async () => applyHealth(await fetchHubHealth()), [applyHealth]);

  // Check the hub's health once on entry; runs and Connect AI update state from their own attempts.
  useEffect(() => {
    let cancelled = false;
    void fetchHubHealth().then((h) => {
      if (!cancelled) applyHealth(h);
    });
    return () => {
      cancelled = true;
    };
  }, [applyHealth]);

  const getToken = useCallback(async () => {
    if (!turnstile.current) throw new Error("The browser check is not ready yet.");
    return (await turnstile.current).getToken();
  }, []);

  const run = useCallback(async () => {
    if (aiLockRef.current || browserRunning.current) return;
    browserRunning.current = true;
    setRunning(true);
    try {
      const out = await runGoose(code, endpoints, {
        getToken: siteKey ? getToken : undefined,
        preferFallback: primaryDown.current,
      });
      fallbackDown.current = out.state === "outage";
      primaryDown.current = out.state !== "normal";
      setState(out.state);
      setByAI(false);
      setOutcome(out);
    } finally {
      browserRunning.current = false;
      setRunning(false);
    }
  }, [code, siteKey, getToken]);

  const connectAI = async () => {
    setAiConnectError("");
    setCheckingAI(true);
    try {
      const latest = await checkHealth();
      if (!agentAllowed(latest.state, latest.health)) {
        setAiConnectError("AI connection is unavailable right now.");
        return;
      }
    } finally {
      setCheckingAI(false);
    }
    connection.current?.disconnect();
    connection.current = connectAgent(endpoints.session, {
      onLock: (tool) => {
        if (browserRunning.current) {
          setAiNotice("The user is running code in the playground. Wait for that run to finish before trying again.");
          return false;
        }
        aiLockRef.current = tool;
        setAiLock(tool);
        setAiNotice("");
        return true;
      },
      onUnlock: () => { aiLockRef.current = null; setAiLock(null); setAiBusy(null); },
      getCode: () => codeRef.current,
      setCode: (next) => {
        edited.current = true;
        codeRef.current = next;
        setCode(next);
      },
      onStarted: (tool) => setAiBusy(tool === "run" ? "AI is running the code…" : "AI is checking the code…"),
      onRunFinished: (result) => { setAiBusy(null); setByAI(true); setOutcome({ kind: "result", result, state: "normal" }); },
      onCheckFinished: (result) => { setAiBusy(null); setByAI(true); setOutcome({ kind: "check", result }); },
      onToolFailed: (_tool, message) => { setAiNotice(message); },
      onState: (next) => {
        setAgent(next);
        if (next.status === "ended" || next.status === "idle") setAiBusy(null);
      },
    }, { getToken: siteKey ? getToken : undefined });
  };

  const disconnectAI = () => {
    connection.current?.disconnect();
    connection.current = null;
  };

  const logout = async () => {
    try {
      await account.logout();
      setUser(null);
    } catch {
      setShareMessage("Logout failed. Try again.");
    }
  };

  const banner = BANNER[state];
  const canRun = !running && aiLock === null;

  return (
    <div className={styles.shell}>
      {feedbackOpen && <FeedbackDialog client={account} user={user} onClose={() => setFeedbackOpen(false)} onLogin={() => setLoginOpen(true)} />}
      <header className={styles.header}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className={styles.brandIcon}
          />
          <h1 className={styles.title}>Goose Playground</h1>
        </div>
        <nav className={styles.headerLinks}>
          <a className={styles.link} href={`${endpoints.site}/about`} target="_blank" rel="noopener noreferrer">
            About Developer
          </a>
          <button type="button" className={styles.linkButton} onClick={() => setFeedbackOpen(true)}>Feedback</button>
          <a className={styles.link} href="https://github.com/aardappel/goose" target="_blank" rel="noreferrer">
            Goose project
          </a>
          {user ? (
            <span className={styles.account}>
              <span className={styles.hint}>{user.displayName || user.username}</span>
              <button type="button" className={styles.linkButton} onClick={logout}>Log out</button>
            </span>
          ) : (
            <button type="button" className={styles.linkButton} onClick={() => setLoginOpen(true)}>Log in</button>
          )}
        </nav>
      </header>
      {loginOpen && (
        <LoginDialog
          client={account}
          onClose={() => setLoginOpen(false)}
          onLoggedIn={(u) => { setUser(u); setLoginOpen(false); }}
        />
      )}

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
        <label className={styles.samplePicker}>
          <span className={styles.sampleLabel}>Sample</span>
          <span className={styles.selectWrap}>
            <select className={styles.sampleSelect} aria-label="Sample" value="" disabled={aiLock !== null} onChange={(e) => {
              if (aiLockRef.current) return;
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
          </span>
        </label>
        <button className={styles.share} onClick={share}>Share</button>
        <span className={styles.shareMessage} role="status">{shareMessage}</span>
        <span className={styles.hint}>Ctrl+Enter</span>
        {siteKey && <div ref={turnstileBox} className={styles.turnstile} />}
      </div>

      {aiLock && <p id="ai-lock-reason" role="status" className={styles.warning}>AI is using the editor. Editing, sample replacement and Run are paused until this call finishes.</p>}
      {aiNotice && <p role="status" className={styles.warning}>{aiNotice}</p>}

      <main className={styles.panes}>
        <section className={styles.editorPane} aria-label="Editor">
          <textarea
            className={styles.editor}
            value={code}
            readOnly={aiLock !== null}
            aria-describedby={aiLock ? "ai-lock-reason" : undefined}
            onChange={(e) => { if (aiLockRef.current) return; edited.current = true; codeRef.current = e.target.value; setCode(e.target.value); }}
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
          <OutputPanel outcome={outcome} busy={running ? "Running…" : aiBusy} byAI={byAI} />
        </section>
      </main>

      <AiPanel
        state={agent}
        available={health === null ? state === "normal" : agentAllowed(state, health)}
        checking={checkingAI}
        connectError={aiConnectError}
        loggedIn={!!user}
        onConnect={() => { void connectAI(); }}
        onDisconnect={disconnectAI}
        onLogin={() => setLoginOpen(true)}
      />
    </div>
  );
}
