import { loadConfig } from "@/lib/env";
import { formatHealthFactor, formatTime } from "@/lib/format";
import { runProbe } from "@/lib/probe";
import { createMetadata } from "@/lib/metadata";
import { CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Verdicts",
  description: "The live verdict ledger: two simulations against the deployed guard.",
  path: "/verdicts",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VerdictsPage(): Promise<ReactNode> {
  const config = loadConfig();
  const probe = await runProbe();

  const decisions =
    probe.results?.map((result, index) => ({
      id: `decision-${index + 1}`,
      verdict: result.verdict,
      intent:
        result.verdict === "ALLOW"
          ? "Rebalance, ending above the floor"
          : "Rebalance, ending below the floor",
      httpStatus: result.httpStatus,
      resultingHealthFactor: result.resultingHealthFactor,
      failureKind: result.failureKind,
      revertReason: result.revertReason,
      gasEstimate: result.gasEstimate,
    })) ?? [];

  const allowed = decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = decisions.filter((d) => d.verdict === "DENY").length;
  const probeLive = probe.live && decisions.length > 0;

  return (
    <section aria-labelledby="verdicts-heading">
      <div className="flex items-center gap-3">
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="verdicts-heading">
          Verdicts
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {allowed} allowed · {refused} refused · {formatTime(probe.at)} UTC
        </span>
      </div>

      {probeLive ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 bg-foreground/[0.03]">
              <tr>
                <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Verdict</th>
                <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Intent</th>
                <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ending HF</th>
                <th className="hidden px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">Gas</th>
                <th className="px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">HTTP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {decisions.map((decision) => (
                <tr key={decision.id} className="transition-colors hover:bg-foreground/[0.02]">
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
                        decision.verdict === "ALLOW"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {decision.verdict === "ALLOW" ? (
                        <CircleCheck className="size-3" aria-hidden="true" />
                      ) : (
                        <CircleX className="size-3" aria-hidden="true" />
                      )}
                      {decision.verdict}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">{decision.intent}</td>
                  <td className="px-5 py-4 font-mono text-xs">
                    {formatHealthFactor(decision.resultingHealthFactor)}
                    <span className="ml-1 text-muted-foreground/60">
                      / floor {config.healthFactorFloor === "" ? "—" : formatHealthFactor(config.healthFactorFloor)}
                    </span>
                  </td>
                  <td className="hidden px-5 py-4 font-mono text-xs text-muted-foreground lg:table-cell">
                    {decision.gasEstimate ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-xs text-muted-foreground">{decision.httpStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {decisions.some((d) => d.revertReason) ? (
            <div className="border-t border-border/70 bg-red-500/[0.03] px-5 py-3">
              <code className="block break-all font-mono text-[11px] text-red-500">
                {decisions.find((d) => d.revertReason)?.revertReason}
              </code>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
          {probe.reason ?? "no live simulation ran"}
        </p>
      )}
    </section>
  );
}
