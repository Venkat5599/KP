"use client";

import { useEffect, useState } from "react";

/**
 * The live panel.
 *
 * Every render reflects a simulation KeeperHub ran against the deployed guard when the
 * request was made. If the deployment has no API key configured, the panel says so rather
 * than showing recorded values dressed as live ones: a status display that lies about its
 * own freshness is worse than no display.
 */

interface ProbeResult {
  readonly label: string;
  readonly resultingHealthFactor: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly httpStatus: number;
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly gasEstimate: string | null;
}

interface ProbePayload {
  readonly live: boolean;
  readonly reason?: string;
  readonly guard?: string;
  readonly floor?: string;
  readonly results?: readonly ProbeResult[];
  readonly at: string;
}

type State =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly payload: ProbePayload }
  | { readonly kind: "error"; readonly message: string };

function formatHealthFactor(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = ((value % 1_000_000_000_000_000_000n) / 10_000_000_000_000_000n)
    .toString()
    .padStart(2, "0");
  return `${whole}.${fraction}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(11, 19);
}

export function LivePanel() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const response = await fetch("/api/probe", { cache: "no-store" });
        const payload = (await response.json()) as ProbePayload;
        if (cancelled) return;
        setState({ kind: "ready", payload });
        setRuns((count) => count + 1);
      } catch (error) {
        if (!cancelled) setState({ kind: "error", message: (error as Error).message });
      }
    }

    void probe();
    const timer = setInterval(probe, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className="panel" aria-label="Live guard status">
      <div className="panel-head">
        <span className="panel-title">Guard, live</span>
        {state.kind === "ready" && state.payload.live ? (
          <span className="panel-stamp">
            {formatTime(state.payload.at)} UTC, run {runs}
          </span>
        ) : null}
      </div>

      {state.kind === "loading" ? (
        <p className="panel-note">Running a simulation against the deployed guard.</p>
      ) : null}

      {state.kind === "error" ? (
        <p className="panel-note panel-note-bad">
          The panel could not reach its own API route. {state.message}
        </p>
      ) : null}

      {state.kind === "ready" && !state.payload.live ? (
        <p className="panel-note panel-note-bad">{state.payload.reason}</p>
      ) : null}

      {state.kind === "ready" && state.payload.live && state.payload.results ? (
        <>
          <p className="panel-note">
            Two calls, one contract, one function, one argument type. Only the state they
            would produce differs.
          </p>

          <ul className="panel-rows">
            {state.payload.results.map((result) => (
              <li className="panel-row" key={result.label}>
                <div className="panel-row-head">
                  <span className={`verdict verdict-${result.verdict.toLowerCase()}`}>
                    {result.verdict}
                  </span>
                  <span className="panel-hf">
                    ends at {formatHealthFactor(result.resultingHealthFactor)}
                  </span>
                </div>

                <span className="panel-status">
                  HTTP {result.httpStatus}
                  {result.gasEstimate ? `, gas ${result.gasEstimate}` : ""}
                </span>

                {result.revertReason ? (
                  <code className="panel-reason">{result.revertReason}</code>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="panel-foot">
            Floor {formatHealthFactor(state.payload.floor ?? "0")}. Refreshes every 15
            seconds.
          </p>
        </>
      ) : null}
    </aside>
  );
}
