import { HoldActions } from "@/components/hold-actions";
import { BrowserHolds } from "@/components/browser-holds";
import { listHolds } from "@/lib/holds";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Holds",
  description: "Intents escalated to the human gate, with release and cancel.",
  path: "/holds",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HoldsPage(): Promise<ReactNode> {
  const holdsPayload = await listHolds();
  const holds = Array.isArray(holdsPayload.holds)
    ? (holdsPayload.holds as readonly {
        holdId?: string;
        intentId?: string;
        status?: string;
        at?: string;
        digest?: string;
      }[])
    : [];

  return (
    <section aria-labelledby="holds-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="holds-heading">
        Holds
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Release sends the held transaction through the guard. Cancel drops it without sending.
      </p>

      {holds.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/70 p-5 text-xs text-muted-foreground">
          No holds right now. From the Execute page, send 0.01 ETH or more with a transaction
          and it will wait here for you.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {holds.map((hold) => (
            <div
              key={hold.holdId ?? hold.intentId ?? "hold"}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 px-5 py-4"
            >
              <span className="font-mono text-xs">{hold.intentId ?? "intent"}</span>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
                  hold.status === "held"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                    : hold.status === "released"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                      : "border-red-500/40 bg-red-500/10 text-red-500"
                }`}
              >
                {hold.status ?? "held"}
              </span>
              {hold.holdId ? <span className="font-mono text-[11px] text-muted-foreground">{hold.holdId}</span> : null}
              {hold.digest ? (
                <code className="break-all font-mono text-[10px] text-muted-foreground">{hold.digest}</code>
              ) : null}
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {hold.at ? hold.at.slice(0, 19).replace("T", " ") + " UTC" : ""}
              </span>
              {hold.status === "held" && hold.holdId !== undefined ? (
                <HoldActions holdId={hold.holdId} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <BrowserHolds />
    </section>
  );
}
