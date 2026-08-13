"use client";

import { WagmiProvider, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Wallet connect: the injected connector only (MetaMask, Rabby, etc. — no embedded
 * or default wallets, nothing custodial). The connected address is used for the
 * position panel: the same pool the guard's invariant reads, read live for YOUR
 * wallet. No key ever leaves the browser; noyeet never asks the wallet to sign.
 */
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [sepolia.id]: http(
      process.env.NEXT_PUBLIC_NOYEET_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
    ),
  },
  ssr: true,
});

export function Web3Providers({ children }: { children: ReactNode }): ReactNode {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
