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
        <p className="mt-2 text-xs text-muted-foreground">
          Connect a wallet (top bar) to see its position on the pool the guard protects.
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
            <dt className="text-[11px] text-muted-foreground">Collateral (ETH)</dt>
            <dd className="mt-1 font-mono text-sm">{fmtEth(position.collateral)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Debt (ETH)</dt>
            <dd className="mt-1 font-mono text-sm">{fmtEth(position.debt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Health factor</dt>
            <dd className="mt-1 font-mono text-sm">{fmtHf(position.healthFactor)}</dd>
          </div>
        </dl>
      )}
      {position !== null && !position.hasPosition ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No position — this wallet hasn't borrowed here.
        </p>
      ) : null}
    </div>
  );
}
