import { AppNav } from "@/components/app-nav";
import { loadConfig } from "@/lib/env";
import { shorten } from "@/lib/format";
import { runProbe } from "@/lib/probe";
import { computeHealth } from "@/lib/health";
import { Radio } from "lucide-react";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The dapp shell: fixed sidebar + minimal top bar. Each nav item is its own page. */
export default async function AppLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const config = loadConfig();
  const probe = await runProbe();
  const health = await computeHealth(probe);
  const probeLive = probe.live && (probe.results?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 px-4 py-6 md:flex">
        <p className="px-2 font-mono text-sm font-semibold tracking-tight">noyeet</p>

        <div className="mt-8">
          <AppNav vertical />
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${probeLive ? "bg-emerald-500" : "bg-red-500"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">Live probe</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {probeLive ? "simulating per request" : (probe.reason ?? "unavailable")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${health.guard.reachable ? "bg-emerald-500" : "bg-red-500"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">Guard</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {health.guard.reachable ? "on chain" : "RPC unreachable"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        {/* Top bar: chain identity only. Navigation lives in the sidebar. */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-6 backdrop-blur-xl">
          <span className="shrink-0 font-mono text-sm font-semibold md:hidden">noyeet</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs">
            <Radio className="size-3 text-muted-foreground" aria-hidden="true" />
            {config.chainName === "" ? "unconfigured chain" : config.chainName}
          </span>
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
