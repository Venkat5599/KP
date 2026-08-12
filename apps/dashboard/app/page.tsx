import { PolicyCanvas } from "@/components/canvas/policy-canvas";
import { ExecutePanel } from "@/components/execute-panel";
import { Verifier } from "@/components/verifier";
import { loadConfig } from "@/lib/env";
import { formatHealthFactor, formatTime, shorten } from "@/lib/format";
import { readGuardConfig } from "@/lib/live";
import { runProbe } from "@/lib/probe";
import { computeHealth } from "@/lib/health";
import { listTransactions } from "@/lib/transactions";
import { listHolds } from "@/lib/holds";
import { createMetadata } from "@/lib/metadata";
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  LayoutGrid,
  Play,
  ShieldCheck,
  Timer,
  ScrollText,
  Sliders,
  CircleCheck,
  CircleX,
  Radio,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "noyeet",
  description: "Simulation-gated execution for onchain agents. Submit an intent, watch the guard decide.",
  path: "/",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NAV = [
  { label: "Execute", href: "#execute", icon: Play },
  { label: "Policy", href: "#policy", icon: Sliders },
  { label: "Overview", href: "#overview", icon: LayoutGrid },
  { label: "Guard", href: "#guard", icon: ShieldCheck },
  { label: "Verdicts", href: "#verdicts", icon: ScrollText },
  { label: "Transactions", href: "#transactions", icon: ArrowLeftRight },
  { label: "Holds", href: "#holds", icon: Timer },
  { label: "Verifier", href: "#verify", icon: BadgeCheck },
  { label: "Operations", href: "#operations", icon: Activity },
] as const;

export default async function DappPage(): Promise<ReactNode> {
  const config = loadConfig();
  const [probe, txPayload, holdsPayload] = await Promise.all([
    runProbe(),
    listTransactions(),
    listHolds(),
  ]);
  const [chainFacts, health] = await Promise.all([readGuardConfig(config), computeHealth(probe)]);

  const decisions =
    probe.results?.map((result, index) => ({
      id: `decision-${index + 1}`,
      verdict: result.verdict,
      intent:
        result.verdict === "ALLOW"
          ? "Rebalance, ending above the floor"
          : "Rebalance, ending below the floor",
      httpStatus: result.httpStatus,
      resultingHealthFactor: result.resultingHealthFactor,
      failureKind: result.failureKind,
      revertReason: result.revertReason,
      gasEstimate: result.gasEstimate,
    })) ?? [];

  const allowed = decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = decisions.filter((d) => d.verdict === "DENY").length;
  const probeLive = probe.live && decisions.length > 0;

  const facts: readonly { label: string; value: string; source: "chain" | "env" }[] = [
    ...(config.guardAddress === ""
      ? []
      : [{ label: "Guard", value: config.guardAddress, source: "env" as const }]),
    ...(config.targetAddress === ""
      ? []
      : [{ label: "Target", value: config.targetAddress, source: "env" as const }]),
    ...(config.executorAddress === ""
      ? []
      : [{ label: "Executor (configured)", value: config.executorAddress, source: "env" as const }]),
    ...(config.chainName === "" ? [] : [{ label: "Chain", value: config.chainName, source: "env" as const }]),
    ...(config.healthFactorFloor === ""
      ? []
      : [{ label: "HF floor", value: formatHealthFactor(config.healthFactorFloor), source: "env" as const }]),
    ...chainFacts.map((fact) => ({ label: fact.label, value: fact.value, source: "chain" as const })),
  ];

  const holds = Array.isArray(holdsPayload.holds)
    ? (holdsPayload.holds as readonly { holdId?: string; intentId?: string; status?: string; at?: string }[])
    : [];

  const stats: readonly { label: string; value: string; sub: string; ok?: boolean }[] = [
    {
      label: "Verdicts (this read)",
      value: probeLive ? String(decisions.length) : "—",
      sub: formatTime(probe.at) + " UTC",
      ok: probeLive,
    },
    {
      label: "Allowed",
      value: String(allowed),
      sub: "would-broadcast",
      ok: allowed > 0,
    },
    {
      label: "Refused",
      value: String(refused),
      sub: refused > 0 ? "reverts before existing" : "nothing refused",
    },
    {
      label: "Guard",
      value: config.guardAddress === "" ? "unset" : shorten(config.guardAddress, 8, 6),
      sub: health.guard.reachable ? "admin() answered" : "RPC unreachable",
      ok: health.guard.reachable,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 px-4 py-6 md:flex">
        <p className="px-2 font-mono text-sm font-semibold tracking-tight">noyeet</p>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Dapp">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
          <a
            href="https://github.com/Venkat5599/KP"
            className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
            Repo
          </a>
        </nav>

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
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="md:hidden font-mono text-sm font-semibold">noyeet</span>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs">
              <Radio className="size-3 text-muted-foreground" aria-hidden="true" />
              {config.chainName === "" ? "unconfigured chain" : config.chainName}
            </span>
            <a
              href="https://github.com/Venkat5599/KP"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-foreground/5"
            >
              GitHub
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </div>
        </header>

        <div className="mx-auto max-w-5xl space-y-14 px-6 py-10">
          {/* Execute */}
          <section id="execute" className="scroll-mt-24" aria-labelledby="execute-heading">
            <div className="flex items-center gap-2">
              <Play className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="execute-heading">
                Execute
              </h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                policy → simulate → broadcast, live per submission
              </span>
            </div>
            <div className="mt-4">
              <ExecutePanel />
            </div>
          </section>

          <section id="policy" className="scroll-mt-24" aria-labelledby="policy-heading">
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="policy-heading">
                Policy
              </h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                compiles to the gateway document and the executeGuarded tuples
              </span>
            </div>
            <div className="mt-4">
              <PolicyCanvas variant="full" />
            </div>
          </section>

          {/* Overview */}
          <section id="overview" className="scroll-mt-24" aria-labelledby="overview-heading">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="overview-heading">
              Overview
            </h2>
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

          {/* Guard */}
          <section id="guard" className="scroll-mt-24" aria-labelledby="guard-heading">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="guard-heading">
                Guard
              </h2>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
              <table className="w-full text-left">
                <thead className="border-b border-border/70 bg-foreground/[0.03]">
                  <tr>
                    <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Field</th>
                    <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Value</th>
                    <th className="hidden px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {facts.map((fact) => (
                    <tr key={`${fact.source}-${fact.label}`} className="transition-colors hover:bg-foreground/[0.02]">
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{fact.label}</td>
                      <td className="px-5 py-3.5">
                        {fact.source === "env" && config.explorer !== "" ? (
                          <a
                            href={`${config.explorer}/address/${fact.value}`}
                            className="break-all font-mono text-xs text-accent underline underline-offset-2"
                          >
                            {fact.value}
                          </a>
                        ) : (
                          <span className="break-all font-mono text-xs">{fact.value}</span>
                        )}
                      </td>
                      <td className="hidden px-5 py-3.5 text-right sm:table-cell">
                        <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {fact.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Verdicts */}
          <section id="verdicts" className="scroll-mt-24" aria-labelledby="verdicts-heading">
            <div className="flex items-center gap-2">
              <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="verdicts-heading">
                Verdicts
              </h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {allowed} allowed · {refused} refused · {formatTime(probe.at)} UTC
              </span>
            </div>
            {probeLive ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full text-left">
                  <thead className="border-b border-border/70 bg-foreground/[0.03]">
                    <tr>
                      <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Verdict</th>
                      <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Intent</th>
                      <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ending HF</th>
                      <th className="hidden px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">Gas</th>
                      <th className="px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">HTTP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {decisions.map((decision) => (
                      <tr key={decision.id} className="transition-colors hover:bg-foreground/[0.02]">
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
                              decision.verdict === "ALLOW"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {decision.verdict === "ALLOW" ? (
                              <CircleCheck className="size-3" aria-hidden="true" />
                            ) : (
                              <CircleX className="size-3" aria-hidden="true" />
                            )}
                            {decision.verdict}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs">{decision.intent}</td>
                        <td className="px-5 py-4 font-mono text-xs">
                          {formatHealthFactor(decision.resultingHealthFactor)}
                          <span className="ml-1 text-muted-foreground/60">
                            / floor {config.healthFactorFloor === "" ? "—" : formatHealthFactor(config.healthFactorFloor)}
                          </span>
                        </td>
                        <td className="hidden px-5 py-4 font-mono text-xs text-muted-foreground lg:table-cell">
                          {decision.gasEstimate ?? "—"}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-xs text-muted-foreground">{decision.httpStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {decisions.some((d) => d.revertReason) ? (
                  <div className="border-t border-border/70 bg-red-500/[0.03] px-5 py-3">
                    <code className="block break-all font-mono text-[11px] text-red-500">
                      {decisions.find((d) => d.revertReason)?.revertReason}
                    </code>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
                {probe.reason ?? "no live simulation ran"}
              </p>
            )}
          </section>

          {/* Transactions */}
          <section id="transactions" className="scroll-mt-24" aria-labelledby="tx-heading">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="tx-heading">
                Transactions
              </h2>
            </div>
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

          {/* Holds */}
          <section id="holds" className="scroll-mt-24" aria-labelledby="holds-heading">
            <div className="flex items-center gap-2">
              <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="holds-heading">
                Holds
              </h2>
            </div>
            {!holdsPayload.configured ? (
              <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
                {holdsPayload.reason ?? "NOYEET_GATEWAY_URL not set"}
              </p>
            ) : holds.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-border/70 p-5 font-mono text-xs text-muted-foreground">
                queue empty
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {holds.map((hold) => (
                  <div key={hold.holdId ?? hold.intentId ?? "hold"} className="flex items-center gap-4 rounded-2xl border border-border/70 px-5 py-4">
                    <span className="font-mono text-xs">{hold.intentId ?? "intent"}</span>
                    <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[11px]">
                      {hold.status ?? "held"}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {hold.holdId ?? ""}
                      {hold.at ? ` at ${hold.at}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Verifier */}
          <section id="verify" className="scroll-mt-24" aria-labelledby="verify-heading">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="verify-heading">
                Verifier
              </h2>
            </div>
            <div className="mt-4">
              <Verifier />
            </div>
          </section>

          {/* Operations */}
          <section id="operations" className="scroll-mt-24" aria-labelledby="ops-heading">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground" id="ops-heading">
                Operations
              </h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["/api/execute", "/api/probe", "/api/health", "/api/metrics", "/api/transactions", "/api/holds"].map((endpoint) => (
                <a
                  key={endpoint}
                  href={endpoint}
                  className="rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-foreground/5"
                >
                  {endpoint}
                </a>
              ))}
            </div>
          </section>

          <footer className="border-t border-border/70 pt-4 font-mono text-[11px] text-muted-foreground">
            {config.guardAddress === ""
              ? "no guard configured"
              : `guard ${shorten(config.guardAddress, 8, 6)} · ${config.chainName === "" ? "unconfigured chain" : config.chainName}`}
          </footer>
        </div>
      </div>
    </div>
  );
}
