import { listHolds } from "@/lib/holds";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Holds",
  description: "Intents escalated to the human gate.",
  path: "/holds",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HoldsPage(): Promise<ReactNode> {
  const holdsPayload = await listHolds();
  const holds = Array.isArray(holdsPayload.holds)
    ? (holdsPayload.holds as readonly { holdId?: string; intentId?: string; status?: string; at?: string }[])
    : [];

  return (
    <section aria-labelledby="holds-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="holds-heading">
        Holds
      </h1>

      {!holdsPayload.configured ? (
        <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
          {holdsPayload.reason ?? "NOYEET_GATEWAY_URL not set"}
        </p>
      ) : holds.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
          queue empty
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {holds.map((hold) => (
            <div key={hold.holdId ?? hold.intentId ?? "hold"} className="flex items-center gap-4 rounded-2xl border border-border/70 px-5 py-4">
              <span className="font-mono text-xs">{hold.intentId ?? "intent"}</span>
              <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[11px]">
                {hold.status ?? "held"}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {hold.holdId ?? ""}
                {hold.at ? ` at ${hold.at}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
