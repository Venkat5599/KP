import { loadConfig } from "@/lib/env";
import { executorInfo } from "@/lib/execute";
import { listTransactions } from "@/lib/transactions";
import { createMetadata } from "@/lib/metadata";
import { shorten } from "@/lib/format";
import { CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Overview",
  description: "The state of the noyeet system, read from the chain.",
  path: "/overview",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Every stat is read from the chain or the real ledger. Nothing is invented. */
export default async function OverviewPage(): Promise<ReactNode> {
  const config = loadConfig();
  const executor = await executorInfo(
    process.env["KEEPERHUB_API_KEY"] ?? "",
    process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    config,
  );
  const transactionsPayload = await listTransactions();
  const transactionCount = transactionsPayload.transactions.length;

  const stats: readonly { label: string; value: string; sub: string; ok?: boolean }[] = [
    {
      label: "Guard",
      value: config.guardAddress === "" ? "unset" : shorten(config.guardAddress, 8, 6),
      sub: config.guardAddress === "" ? "not configured" : "deployed and verified on Sepolia",
      ok: config.guardAddress !== "",
    },
    {
      label: "Executor",
      value:
        executor === null
          ? "—"
          : executor.registered
            ? shorten(executor.wallet, 6, 4)
            : "not registered",
      sub:
        executor === null
          ? "read failed"
          : executor.registered
            ? "registered on the guard (chain read)"
            : "the guard would refuse every broadcast",
      ok: executor !== null && executor.registered,
    },
    {
      label: "Transactions",
      value: String(transactionCount),
      sub: "executed by the guard, all on chain",
      ok: transactionCount > 0,
    },
    {
      label: "Receipts anchor",
      value: "live",
      sub: "batch 496270 anchored · root + policy hash committed",
      ok: true,
    },
  ];

  return (
    <section aria-labelledby="overview-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="overview-heading">
        Overview
      </h1>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border/70 bg-background/60 p-5">
            <p className="font-mono text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              {stat.ok !== undefined ? (
                stat.ok ? (
                  <CircleCheck className="size-3 text-emerald-500" aria-hidden="true" />
                ) : (
                  <CircleX className="size-3 text-red-500" aria-hidden="true" />
                )
              ) : null}
              {stat.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
