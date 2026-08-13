import { AppNav } from "@/components/app-nav";
import { ConnectWallet } from "@/components/connect-wallet";
import { loadConfig } from "@/lib/env";
import { shorten } from "@/lib/format";
import { executorInfo } from "@/lib/execute";
import { Radio } from "lucide-react";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The dapp shell: fixed sidebar + minimal top bar. Each nav item is its own page. */
export default async function AppLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const config = loadConfig();
  const executor = await executorInfo(
    process.env["KEEPERHUB_API_KEY"] ?? "",
    process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    config,
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 px-4 py-6 md:flex">
        <a href="/" className="px-2 font-mono text-sm font-semibold tracking-tight hover:opacity-80">
          noyeet
        </a>

        <div className="mt-8">
          <AppNav vertical />
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${executor !== null && executor.registered ? "bg-emerald-500" : "bg-red-500"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">Executor</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {executor !== null && executor.registered
                  ? `registered · ${shorten(executor.wallet, 6, 4)}`
                  : executor !== null
                    ? `not registered · ${shorten(executor.wallet, 6, 4)}`
                    : "read failed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${config.guardAddress === "" ? "bg-red-500" : "bg-emerald-500"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">Guard</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {config.guardAddress === "" ? "unconfigured" : `${shorten(config.guardAddress, 8, 6)} · on chain`}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        {/* Top bar: chain identity only. Navigation lives in the sidebar. */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-6 backdrop-blur-xl">
          <a href="/" className="shrink-0 font-mono text-sm font-semibold hover:opacity-80 md:hidden">noyeet</a>
          <div className="ml-auto inline-flex shrink-0 items-center gap-2">
            <ConnectWallet />
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs">
              <Radio className="size-3 text-muted-foreground" aria-hidden="true" />
              {config.chainName === "" ? "unconfigured chain" : config.chainName}
            </span>
          </div>
        </header>

        {/* Mobile nav row */}
        <div className="border-b border-border/70 px-6 py-2 md:hidden">
          <AppNav />
        </div>

        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>

        <footer className="border-t border-border/70 px-6 py-4 font-mono text-[11px] text-muted-foreground">
          {config.guardAddress === ""
            ? "no guard configured"
            : `guard ${shorten(config.guardAddress, 8, 6)} · ${config.chainName === "" ? "unconfigured chain" : config.chainName}`}
        </footer>
      </div>
    </div>
  );
}
