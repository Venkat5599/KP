"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The latest real transactions, from the on-chain ledger the site reads at
 * request time. No simulation, no mock rows — these are the actual broadcasts.
 */
interface SeedTx {
  readonly label: string;
  readonly hash: string;
  readonly detail?: string;
  readonly executionId?: string;
}

const shorten = (hash: string): string => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function RecentTransactions(): ReactNode {
  const [txs, setTxs] = useState<readonly SeedTx[]>([]);

  useEffect(() => {
    fetch("/api/transactions", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ transactions?: readonly SeedTx[] }>)
      .then((payload) => setTxs(payload.transactions?.slice(0, 4) ?? []))
      .catch(() => setTxs([]));
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-between bg-white p-6 font-mono">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
          Recent transactions · on chain
        </p>
        <ul className="mt-4 space-y-2.5">
          {txs.map((tx) => (
            <li key={tx.hash} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-neutral-500">{tx.label}</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
              >
                {shorten(tx.hash)}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 text-[11px] text-neutral-400">
        every broadcast executed by the guard on Sepolia · receipts anchored to the AnchorStore
      </p>
    </div>
  );
}
