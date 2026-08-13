"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HoldActions } from "./hold-actions";

/**
 * Holds this browser created. The serverless hold ledger is per-instance, so the
 * instance rendering /holds may not be the one that created a hold. The execute
 * page keeps a copy of every hold it triggers (localStorage, key `noyeet:hold:*`);
 * this renders them with the same release/cancel actions — the human gate is
 * never invisible to the person who triggered it.
 */
interface BrowserHold {
  readonly holdId: string;
  readonly intentId: string;
  readonly verdict: "HOLD";
  readonly status?: "held" | "released" | "cancelled";
  readonly digest?: string;
  readonly at?: string;
  readonly intent?: unknown;
}

export function BrowserHolds(): ReactNode {
  const [holds, setHolds] = useState<readonly BrowserHold[]>([]);

  const read = (): BrowserHold[] => {
    const found: BrowserHold[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null || !key.startsWith("noyeet:hold:")) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as BrowserHold;
        if (parsed.holdId !== undefined) found.push(parsed);
      } catch {
        // corrupt entry — ignore
      }
    }
    return found.sort((a, b) => ((a.at ?? "") < (b.at ?? "") ? 1 : -1));
  };

  useEffect(() => {
    setHolds(read());
  }, []);

  const clear = (holdId: string) => {
    try {
      localStorage.removeItem(`noyeet:hold:${holdId}`);
      setHolds((previous) => previous.filter((hold) => hold.holdId !== holdId));
    } catch {
      // storage blocked — ignore
    }
  };

  if (holds.length === 0) return null;

  return (
    <div className="mt-4">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        This browser&apos;s holds
      </h2>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        created from the execute page in this browser; the serverless ledger is per-instance, so these are
        shown from the browser&apos;s copy. Release and cancel work statelessly.
      </p>
      <div className="mt-2 space-y-2">
        {holds.map((hold) => (
          <div
            key={hold.holdId}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 px-5 py-4"
          >
            <span className="font-mono text-xs">{hold.intentId}</span>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                hold.status === "released"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                  : hold.status === "cancelled"
                    ? "border-red-500/40 bg-red-500/10 text-red-500"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600"
              }`}
            >
              {hold.status ?? "held"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{hold.holdId}</span>
            {hold.digest !== undefined ? (
              <code className="break-all font-mono text-[10px] text-muted-foreground">{hold.digest}</code>
            ) : null}
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {hold.at !== undefined ? hold.at.slice(0, 19).replace("T", " ") + " UTC" : ""}
            </span>
            <HoldActions
              holdId={hold.holdId}
              intent={hold.intent}
              onResolved={() => setHolds(read())}
            />
            <button
              type="button"
              onClick={() => clear(hold.holdId)}
              className="rounded-lg border border-border/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-border/20"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
