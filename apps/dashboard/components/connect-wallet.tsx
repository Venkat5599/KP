"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shorten } from "@/lib/format";
import { Wallet } from "lucide-react";
import type { ReactNode } from "react";

/** Connect / disconnect for the injected wallet. Nothing is ever signed. */
export function ConnectWallet(): ReactNode {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address !== undefined) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        title={`${address} — click to disconnect`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-border/20"
      >
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {shorten(address, 6, 4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        const connector = connectors[0];
        if (connector !== undefined) connect({ connector });
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-border/20"
    >
      <Wallet className="size-3 text-muted-foreground" aria-hidden="true" />
      Connect wallet
    </button>
  );
}
