"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, CircleX, Loader2, Play, ShieldAlert, Timer } from "lucide-react";

/**
 * The dapp's transaction panel. One form: pick an amount, submit, and the server
 * runs the real pipeline — policy VM, guard-wrapped simulation, idempotent
 * broadcast. The receipt shown is the actual result of that run.
 */

interface ExecuteResponse {
  readonly live: boolean;
  readonly reason?: string;
  readonly intentId?: string;
  readonly holdId?: string;
  readonly heldIntent?: {
    readonly intentId: string;
    readonly chainId: number;
    readonly calls: readonly { target: string; value: string; data: string }[];
    readonly invariants: readonly {
      target: string;
      probe: string;
      word: number;
      op: string;
      threshold: string;
    }[];
  };
  readonly verdict?: "ALLOW" | "HOLD" | "DENY";
  readonly reasons?: readonly { code: string; severity: string; message: string }[];
  readonly simulation?: {
    readonly wouldRevert: boolean;
    readonly gasEstimate?: string;
    readonly revertReason?: string;
  } | null;
  readonly execution?: { readonly executionId: string } | null;
  readonly digest?: string;
  readonly executor?: { readonly wallet: string; readonly registered: boolean } | null;
  readonly at: string;
}

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; payload: ExecuteResponse }
  | { kind: "error"; message: string };

export function ExecutePanel(): ReactNode {
  const [amount, setAmount] = useState("0.1");
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setState({ kind: "running" });
    fetch("/api/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountEth: amount, ...(value.trim() === "" ? {} : { valueEth: value }) }),
      cache: "no-store",
    })
      .then((response) => response.json() as Promise<ExecuteResponse>)
      .then((payload) => {
        // A HOLD verdict carries the full held intent. The serverless hold ledger is
        // per-instance, so the browser keeps a copy of the holds it created — the
        // /holds page renders those alongside the instance ledger so the human gate
        // is never invisible to the person who triggered it.
        if (payload.verdict === "HOLD" && payload.holdId !== undefined && payload.heldIntent !== undefined) {
          try {
            localStorage.setItem(
              `noyeet:hold:${payload.holdId}`,
              JSON.stringify({
                holdId: payload.holdId,
                intentId: payload.intentId,
                verdict: payload.verdict,
                digest: payload.digest,
                at: payload.at,
                intent: payload.heldIntent,
              }),
            );
          } catch {
            // storage full or blocked — the instance ledger still has it
          }
        }
        setState({ kind: "done", payload });
      })
      .catch((error: unknown) => setState({ kind: "error", message: (error as Error).message }));
  };

  const payload = state.kind === "done" ? state.payload : null;

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between">
        <form onSubmit={submit} className="flex flex-1 flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="amount" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              borrowMore amount (ETH)
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-border/70 bg-background px-4 focus-within:ring-2 focus-within:ring-accent">
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setState({ kind: "idle" });
                }}
                placeholder="0.1"
                className="w-full bg-transparent py-3 font-mono text-lg outline-none"
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              borrows against the live position; the guard asserts HF ≥ floor after
            </p>
          </div>

          <div className="flex-1">
            <label htmlFor="value" className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              native value (ETH, optional)
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-border/70 bg-background px-4 focus-within:ring-2 focus-within:ring-accent">
              <input
                id="value"
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setState({ kind: "idle" });
                }}
                placeholder="0.012 — sends value, triggers HOLD"
                className="w-full bg-transparent py-3 font-mono text-lg outline-none"
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              at or above the policy's hold threshold (0.01 ETH) the intent is held for a
              human instead of executing
            </p>
          </div>

          <button
            type="submit"
            disabled={state.kind === "running"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.kind === "running" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Running…
              </>
            ) : (
              <>
                <Play className="size-4" aria-hidden="true" />
                Execute
              </>
            )}
          </button>
        </form>
      </div>

      {payload?.executor && !payload.executor.registered ? (
        <div className="flex items-start gap-3 border-t border-amber-500/30 bg-amber-500/5 px-6 py-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="font-mono text-xs">
            <p className="font-semibold text-amber-600">Executor not registered</p>
            <p className="mt-1 text-muted-foreground">
              Broadcasts sign with {payload.executor.wallet.slice(0, 10)}…, which the guard
              does not accept yet. As admin: setExecutor({payload.executor.wallet}, true) on
              {` ${""}`}the guard.
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="border-t border-border/70 px-6 py-4 font-mono text-xs text-red-500">
          {state.message}
        </div>
      ) : null}

      {payload ? (
        <div className="border-t border-border/70 p-6">
          {!payload.live ? (
            <p className="font-mono text-xs text-red-500">{payload.reason}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {payload.verdict === "ALLOW" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-600">
                    <CircleCheck className="size-3.5" aria-hidden="true" />
                    ALLOW
                  </span>
                ) : payload.verdict === "HOLD" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 font-mono text-xs font-semibold text-amber-600">
                    <Timer className="size-3.5" aria-hidden="true" />
                    HOLD
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 font-mono text-xs font-semibold text-red-500">
                    <CircleX className="size-3.5" aria-hidden="true" />
                    DENY
                  </span>
                )}
                {payload.execution ? (
                  <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-xs">
                    executionId {payload.execution.executionId}
                  </span>
                ) : null}
                {payload.holdId ? (
                  <a href="/holds" className="rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1 font-mono text-xs text-amber-600">
                    {payload.holdId} — held, open /holds
                  </a>
                ) : null}
                {payload.simulation?.gasEstimate ? (
                  <span className="rounded-full border border-border/70 px-3 py-1 font-mono text-xs">
                    gas {payload.simulation.gasEstimate}
                  </span>
                ) : null}
              </div>

              {payload.reasons?.map((reason) => (
                <div
                  key={`${reason.code}-${reason.message}`}
                  className={`rounded-xl border px-4 py-3 ${
                    reason.severity === "deny" || payload.verdict === "DENY"
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-border/70"
                  }`}
                >
                  <p className="font-mono text-xs font-semibold">{reason.code}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{reason.message}</p>
                </div>
              ))}

              {payload.simulation?.revertReason ? (
                <code className="block break-all rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 font-mono text-xs text-red-500">
                  {payload.simulation.revertReason}
                </code>
              ) : null}

              {payload.digest ? (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Receipt digest
                  </p>
                  <code className="mt-1 block break-all font-mono text-xs">{payload.digest}</code>
                </div>
              ) : null}

              <p className="font-mono text-[11px] text-muted-foreground">
                intent {payload.intentId ?? ""} · {payload.at.slice(0, 19).replace("T", " ")} UTC
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
