import { loadConfig } from "@/lib/env";
import { executorInfo } from "@/lib/execute";
import { listTransactions } from "@/lib/transactions";
import { createMetadata } from "@/lib/metadata";
import { shorten } from "@/lib/format";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "noyeet",
  description: "Agents do not get keys. They get permits, enforced atomically on chain.",
  path: "/",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LandingPage(): Promise<ReactNode> {
  const config = loadConfig();
  const executor = await executorInfo(
    process.env["KEEPERHUB_API_KEY"] ?? "",
    process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    config,
  );
  const transactions = (await listTransactions()).transactions;

  const status =
    config.guardAddress === ""
      ? "guard not configured"
      : executor !== null && executor.registered
        ? `guard ${shorten(config.guardAddress, 8, 6)} · executor registered · ${transactions.length} transactions on chain`
        : `guard ${shorten(config.guardAddress, 8, 6)} · executor not registered`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6">
      <header className="flex h-16 items-center justify-between">
        <a href="/" className="font-mono text-sm font-semibold tracking-tight hover:opacity-80">
          noyeet
        </a>
        <a
          href="/execute"
          className="inline-flex items-center rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Open dapp
        </a>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{status}</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Agents don&apos;t get keys. They get permits.
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Every permit is decided by what the chain says will happen, and enforced
          atomically when it does.
        </p>
        <a
          href="/execute"
          className="mt-8 inline-flex w-fit items-center rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Open dapp
        </a>
      </section>

      <section className="pb-16">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Recent transactions · on chain
        </h2>
        <ul className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/70">
          {transactions.slice(0, 5).map((tx) => (
            <li key={tx.hash} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="truncate font-mono text-xs">{tx.label}</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-mono text-xs text-accent underline underline-offset-2"
              >
                {shorten(tx.hash ?? "", 10, 8)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-border/70 py-4 font-mono text-[11px] text-muted-foreground">
        {status}
      </footer>
    </main>
  );
}
