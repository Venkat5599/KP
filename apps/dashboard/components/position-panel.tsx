"use client";

import { useAccount } from "wagmi";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The connected wallet's position on the demo pool — read live from the chain
 * through /api/position (same contract the guard's invariant reads). Nothing is
 * signed; the wallet is only an address to look up.
 */
interface PositionResponse {
  readonly hasPosition: boolean;
  readonly collateral: string;
  readonly debt: string;
  readonly healthFactor: string | null;
  readonly pool: string;
  readonly error?: string;
}

const fmtEth = (wei: string): string => (Number(wei) / 1e18).toFixed(4);
const fmtHf = (hf: string | null): string => (hf === null ? "∞" : (Number(hf) / 1e18).toFixed(4));

export function PositionPanel(): ReactNode {
  const { address, isConnected } = useAccount();
  const [position, setPosition] = useState<PositionResponse | null>(null);

  useEffect(() => {
    if (!isConnected || address === undefined) {
      setPosition(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/position?address=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<PositionResponse>)
      .then((payload) => {
        if (!cancelled) setPosition(payload);
      })
      .catch(() => {
        if (!cancelled) setPosition(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  if (!isConnected || address === undefined) {
    return (
      <div className="mt-4 rounded-2xl border border-border/70 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your position
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          connect a wallet (top bar) to read its position on the demo pool — the same
          pool the guard&apos;s invariant probes
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border/70 p-5">
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Your position
      </p>
      {position === null ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">reading the chain…</p>
      ) : position.error !== undefined ? (
        <p className="mt-2 font-mono text-xs text-red-500">{position.error}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <dt className="font-mono text-[11px] text-muted-foreground">collateral</dt>
            <dd className="mt-1 font-mono text-sm">{fmtEth(position.collateral)} ETH</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] text-muted-foreground">debt</dt>
            <dd className="mt-1 font-mono text-sm">{fmtEth(position.debt)} ETH</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] text-muted-foreground">health factor</dt>
            <dd className="mt-1 font-mono text-sm">{fmtHf(position.healthFactor)}</dd>
          </div>
        </dl>
      )}
      {position !== null && !position.hasPosition ? (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          no position on the demo pool — this wallet has never borrowed here
        </p>
      ) : null}
    </div>
  );
}
