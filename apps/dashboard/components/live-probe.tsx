"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The hero's dashboard visual, live: fetches /api/probe and renders the real
 * verdicts in the same frame the template reserved for a mock screenshot. Nothing
 * here is a replay; the data is whatever the deployed guard says right now.
 */

interface ProbeResult {
  readonly label: string;
  readonly resultingHealthFactor: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly httpStatus: number;
  readonly revertReason: string | null;
}

interface ProbePayload {
  readonly live: boolean;
  readonly reason?: string;
  readonly results?: readonly ProbeResult[];
  readonly at: string;
}

function formatHealthFactor(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = ((value % 1_000_000_000_000_000_000n) / 10_000_000_000_000_000n)
    .toString()
    .padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function LiveProbe(): ReactNode {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; payload: ProbePayload }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/probe", { cache: "no-store" })
      .then((response) => response.json() as Promise<ProbePayload>)
      .then((payload) => {
        if (!cancelled) setState({ kind: "ready", payload });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: (error as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Running a live simulation against the deployed guard…
      </div>
    );
  }

  if (state.kind === "error" || !state.payload.live || state.payload.results === undefined) {
    const reason = state.kind === "error" ? state.message : (state.payload.reason ?? "no live simulation ran");
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-sm font-medium text-neutral-900">No live verdicts</p>
        <p className="text-xs text-neutral-500">{reason}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          Verdict ledger
        </p>
        <p className="font-mono text-[10px] text-neutral-400">
          {state.payload.at.slice(11, 19)} UTC
        </p>
      </div>

      <div className="space-y-3">
        {state.payload.results.map((result) => (
          <div
            key={result.label}
            className={`rounded-2xl border p-4 ${
              result.verdict === "ALLOW"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-red-500/40 bg-red-500/10"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                  result.verdict === "ALLOW"
                    ? "bg-emerald-500/20 text-emerald-700"
                    : "bg-red-500/20 text-red-600"
                }`}
              >
                {result.verdict}
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                ends at {formatHealthFactor(result.resultingHealthFactor)}
              </span>
            </div>
            {result.revertReason ? (
              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-red-600">
                {result.revertReason}
              </p>
            ) : (
              <p className="mt-2 font-mono text-[10px] text-neutral-500">
                executeGuarded, simulated live — HTTP {result.httpStatus}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] text-neutral-400">
        simulate: true · per request · nothing cached
      </p>
    </div>
  );
}
