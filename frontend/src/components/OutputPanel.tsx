import type { Outcome } from "@/lib/contract";
import type { RunOutcome } from "@/lib/runGoose";
import styles from "./Playground.module.css";

const LABEL: Record<Outcome, string> = {
  compile_error: "Compile error",
  exited: "Exited",
  timeout: "Stopped: time limit (10 s)",
  output_limit: "Stopped: output limit (1 MB)",
  killed: "Stopped: memory or process limit",
};

export default function OutputPanel({ outcome, running }: { outcome: RunOutcome | null; running: boolean }) {
  if (running) return <p className={styles.muted}>Running…</p>;
  if (!outcome) return <p className={styles.muted}>Press Run to see the output.</p>;
  if (outcome.kind === "error") return <p className={styles.error}>{outcome.message}</p>;

  const r = outcome.result;
  const status = r.outcome === "exited" ? `Exited with code ${r.exitCode}` : LABEL[r.outcome];
  return (
    <div className={styles.output}>
      <p className={styles.status}>
        {status} · {r.durationMs} ms · {r.backend === "onprem" ? "server" : "backup server"}
        {r.truncated && " · output truncated"}
      </p>
      {r.diagnostics.length > 0 && (
        <ul className={styles.diagnostics}>
          {r.diagnostics.map((d, i) => (
            <li key={i} className={d.severity === "error" ? styles.error : styles.warning}>
              {d.line ? `line ${d.line}${d.col ? `:${d.col}` : ""}: ` : ""}
              {d.message}
            </li>
          ))}
        </ul>
      )}
      {r.stdout && <pre className={styles.stdout}>{r.stdout}</pre>}
      {r.stderr && <pre className={styles.stderr}>{r.stderr}</pre>}
    </div>
  );
}
