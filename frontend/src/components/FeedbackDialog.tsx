"use client";

import { useEffect, useRef, useState } from "react";
import { AccountError, type AccountClient, type AccountUser } from "@/lib/account";
import styles from "./Playground.module.css";

/** Public app feedback in an animated native dialog, sharing the existing login client. */
export default function FeedbackDialog({ client, user, onClose, onLogin }: { client: AccountClient; user: AccountUser | null; onClose: () => void; onLogin: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (element && !element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    }
    return () => {
      if (typeof element?.close === "function") element.close();
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);
  const close = () => { if (!sending.current) onClose(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current || !content.trim() || (!user && !password.trim())) return;
    sending.current = true; setBusy(true); setError("");
    try {
      await client.submitFeedback(content, user ? undefined : password);
      setContent(""); setPassword(""); setSent(true);
    } catch (cause) {
      setError(cause instanceof AccountError && cause.status === 429 ? "Too many attempts. Please try again later." : "Could not send feedback. Your text has been kept. Please try again.");
    } finally { sending.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.feedbackDialog}`} aria-labelledby="feedback-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
    <form className={styles.loginForm} onSubmit={submit}>
      <h2 id="feedback-title" className={styles.dialogTitle}>Feedback</h2>
      <p className={styles.hint}>Feedback is posted publicly in the main site comments with Goose Playground.</p>
      {sent ? <p role="status">Thank you. Your feedback has been posted.</p> : <>
        {user ? <p className={styles.hint}>Posting as {user.displayName || user.username}</p> : <>
          <button type="button" className={styles.linkButton} onClick={onLogin} disabled={busy}>Sign in (password or Google)</button>
          <label className={styles.field}>Password for editing or deleting<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
        </>}
        <label className={styles.field}>Your feedback<textarea autoFocus rows={6} value={content} onChange={event => setContent(event.target.value)} required disabled={busy} /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.run} disabled={busy || !content.trim() || (!user && !password.trim())}>{busy ? "Sending…" : "Send feedback"}</button>
      </>}
      <div className={styles.dialogActions}><button type="button" className={styles.linkButton} onClick={close} disabled={busy}>Close</button></div>
    </form>
  </dialog>;
}
