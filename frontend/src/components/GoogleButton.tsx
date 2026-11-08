"use client";

import { useEffect, useRef, useState } from "react";
import { loginMessage, type AccountClient, type AccountUser } from "@/lib/account";
import styles from "./Playground.module.css";

interface GoogleIdentity {
  initialize(options: { client_id: string; nonce: string; auto_select: boolean; callback: (r: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

let scriptReady: Promise<GoogleIdentity> | undefined;

/** Loads Google Identity Services once; a failed load can be retried by the next mount. */
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  scriptReady ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      scriptReady = undefined;
      script.remove();
      reject(new Error("GOOGLE_SCRIPT_FAILED"));
    };
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => (window.google?.accounts.id ? resolve(window.google.accounts.id) : fail());
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptReady;
}

interface Props {
  client: AccountClient;
  remember: boolean;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  onLoggedIn(user: AccountUser): void;
}

/**
 * Google's official button. The credential is exchanged at the jace-s API for the same account
 * session as a password login. Hidden when Google sign-in is not configured.
 */
export default function GoogleButton({ client, remember, disabled, onBusyChange, onLoggedIn }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ remember, disabled, onBusyChange, onLoggedIn });
  useEffect(() => {
    latest.current = { remember, disabled, onBusyChange, onLoggedIn };
  });
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let busy = false;
    const container = host.current;
    async function accept(credential: string) {
      if (!active || busy || latest.current.disabled) return;
      busy = true;
      latest.current.onBusyChange(true);
      setError("");
      try {
        const user = await client.googleLogin(credential, latest.current.remember);
        if (active) latest.current.onLoggedIn(user);
      } catch (cause) {
        if (active) {
          setError(loginMessage(cause));
          setAttempt((n) => n + 1);
        }
      } finally {
        busy = false;
        if (active) latest.current.onBusyChange(false);
      }
    }
    (async () => {
      try {
        const config = await client.googleConfig();
        if (!active) return;
        setEnabled(config.enabled);
        if (!config.enabled || !config.clientId || !container) return;
        const nonce = await client.googleChallenge();
        const identity = await loadGoogle();
        if (!active) return;
        identity.initialize({ client_id: config.clientId, nonce, auto_select: false, callback: ({ credential }) => void accept(credential) });
        container.replaceChildren();
        identity.renderButton(container, {
          // The page is English; without a locale Google renders the button in the browser language.
          type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "en",
          width: Math.min(320, container.clientWidth || 320),
        });
      } catch {
        if (active) {
          setEnabled(true);
          setError("Google sign-in could not start. Try again later.");
        }
      }
    })();
    return () => {
      active = false;
    };
    // A new attempt renders the button again with a fresh one-use nonce.
  }, [client, attempt]);

  return (
    <div hidden={!enabled}>
      <div ref={host} style={{ minHeight: 44, display: "flex", justifyContent: "center" }} />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}
