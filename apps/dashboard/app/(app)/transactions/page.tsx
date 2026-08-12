import { loadConfig } from "@/lib/env";
import { shorten } from "@/lib/format";
import { listTransactions } from "@/lib/transactions";
import { createMetadata } from "@/lib/metadata";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Transactions",
  description: "Receipts and broadcasts through the noyeet pipeline.",
  path: "/transactions",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TransactionsPage(): Promise<ReactNode> {
  const config = loadConfig();
  const txPayload = await listTransactions();

  return (
    <section aria-labelledby="tx-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="tx-heading">
        Transactions
      </h1>

      {txPayload.transactions.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
          none{txPayload.storeConfigured ? "" : " — DATABASE_URL not set, no seeds configured"}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 bg-foreground/[0.03]">
              <tr>
                <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Action</th>
                <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Execution</th>
                <th className="px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tx hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {txPayload.transactions.map((tx) => (
                <tr key={tx.id} className="transition-colors hover:bg-foreground/[0.02]">
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs">{tx.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{tx.detail}</p>
                  </td>
                  <td className="px-5 py-4">
                    {tx.executionId ? (
                      <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[11px]">
                        {tx.executionId}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] italic text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {tx.hash ? (
                      <a
                        href={`${config.explorer}/tx/${tx.hash}`}
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-accent underline underline-offset-2"
                      >
                        {shorten(tx.hash, 10, 8)}
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] italic text-muted-foreground">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
