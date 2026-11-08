"use client";

import { useEffect, useRef, useState } from "react";
import { loginMessage, type AccountClient, type AccountUser } from "@/lib/account";
import { endpoints } from "@/lib/endpoints";
import GoogleButton from "./GoogleButton";
import styles from "./Playground.module.css";

interface Props {
  client: AccountClient;
  onClose(): void;
  onLoggedIn(user: AccountUser): void;
}

/** jace-s account login in a modal dialog: password, Google, and links to sign-up and reset. */
export default function LoginDialog({ client, onClose, onLoggedIn }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onLoggedIn(await client.login(username, password, remember));
    } catch (cause) {
      setError(loginMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="login-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form className={styles.loginForm} onSubmit={submit}>
        <h2 id="login-title" className={styles.dialogTitle}>Log in with your jace-s account</h2>
        <p className={styles.hint}>Logged in, an AI connection lasts up to 8 hours instead of 2.</p>
        <label className={styles.field}>
          <span>Username</span>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={busy} />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={busy} />
          <span>Keep me logged in</span>
        </label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.share} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.run} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        </div>
        <GoogleButton client={client} remember={remember} disabled={busy} onBusyChange={setBusy} onLoggedIn={onLoggedIn} />
        <p className={styles.hint}>
          <a className={styles.link} href={`${endpoints.site}/register`} target="_blank" rel="noreferrer">Create an account</a>
          {" · "}
          <a className={styles.link} href={`${endpoints.site}/login`} target="_blank" rel="noreferrer">Forgot your password?</a>
        </p>
      </form>
    </dialog>
  );
}
