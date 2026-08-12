import { Verifier } from "@/components/verifier";
import { loadConfig } from "@/lib/env";
import { formatHealthFactor, formatTime, shorten } from "@/lib/format";
import { readGuardConfig } from "@/lib/live";
import { runProbe } from "@/lib/probe";
import { computeHealth } from "@/lib/health";
import { listTransactions } from "@/lib/transactions";
import { listHolds } from "@/lib/holds";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Dashboard",
  description: "Live status of the noyeet guard: verdicts, guard state, transactions, holds.",
  path: "/dashboard",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthFact {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export default async function DashboardPage(): Promise<ReactNode> {
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

  const healthFacts: readonly HealthFact[] = [
    {
      label: "Probe",
      ok: health.probe.live,
      detail: health.probe.live
        ? `answered ${formatTime(probe.at)} UTC`
        : (health.probe.reason ?? "no live simulation ran"),
    },
    {
      label: "Guard",
      ok: health.guard.reachable && config.guardAddress !== "",
      detail:
        config.guardAddress === ""
          ? "NOYEET_GUARD_ADDRESS not set"
          : health.guard.reachable
            ? "admin() answered"
            : "RPC unreachable",
    },
    {
      label: "Store",
      ok: health.store.configured,
      detail: health.store.configured
        ? `Postgres connected${health.store.receipts !== null ? `, ${health.store.receipts} receipt(s)` : ""}`
        : "DATABASE_URL not set",
    },
    {
      label: "Gateway",
      ok: health.gateway.configured,
      detail: health.gateway.configured ? "NOYEET_GATEWAY_URL set" : "NOYEET_GATEWAY_URL not set",
    },
  ];

  const facts: readonly { label: string; value: string; source: "chain" | "configuration" }[] = [
    ...(config.guardAddress === ""
      ? []
      : [{ label: "guard", value: config.guardAddress, source: "configuration" as const }]),
    ...(config.targetAddress === ""
      ? []
      : [{ label: "target (invariant reads)", value: config.targetAddress, source: "configuration" as const }]),
    ...(config.executorAddress === ""
      ? []
      : [{ label: "executor", value: config.executorAddress, source: "configuration" as const }]),
    ...(config.chainName === "" ? [] : [{ label: "chain", value: config.chainName, source: "configuration" as const }]),
    ...(config.healthFactorFloor === ""
      ? []
      : [{ label: "health factor floor", value: formatHealthFactor(config.healthFactorFloor), source: "configuration" as const }]),
    ...chainFacts.map((fact) => ({ label: fact.label, value: fact.value, source: "chain" as const })),
  ];

  const holds = Array.isArray(holdsPayload.holds)
    ? (holdsPayload.holds as readonly { holdId?: string; intentId?: string; status?: string; at?: string }[])
    : [];

  const nav = [
    { href: "#guard", label: "Guard" },
    { href: "#ledger", label: "Ledger" },
    { href: "#transactions", label: "Transactions" },
    { href: "#holds", label: "Holds" },
    { href: "#verify", label: "Verifier" },
    { href: "#operations", label: "Operations" },
  ];

  const endpoints = ["/api/probe", "/api/health", "/api/metrics", "/api/transactions", "/api/holds"];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-64 md:shrink-0">
        <div className="md:sticky md:top-24 flex flex-col gap-8">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>

          <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Dashboard">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/"
              className="rounded-lg px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              ← landing
            </a>
          </nav>

          <div className="space-y-2">
            {healthFacts.map((fact) => (
              <div
                key={fact.label}
                className={`rounded-xl border p-3 ${
                  fact.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {fact.label}
                </p>
                <p className="mt-0.5 break-words font-mono text-xs">{fact.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main panels */}
      <div className="min-w-0 flex-1 space-y-12 pb-16">
        <section id="guard" aria-labelledby="guard-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="guard-heading">
            Guard
          </h2>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {facts.map((fact) => (
              <div key={`${fact.source}-${fact.label}`} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="font-mono text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="break-all font-mono text-xs">
                  {fact.source === "configuration" && config.explorer !== "" ? (
                    <a href={`${config.explorer}/address/${fact.value}`} className="text-accent underline underline-offset-2">
                      {fact.value}
                    </a>
                  ) : (
                    fact.value
                  )}
                  <span className="ml-2 text-muted-foreground/60">
                    [{fact.source === "chain" ? "chain" : "env"}]
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="ledger" aria-labelledby="ledger-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="ledger-heading">
            Verdict ledger
            <span className="ml-3 normal-case text-xs font-normal text-muted-foreground/60">
              {allowed} allowed · {refused} refused · {formatTime(probe.at)} UTC
            </span>
          </h2>
          {probe.live && decisions.length > 0 ? (
            <div className="mt-3 space-y-3">
              {decisions.map((decision) => (
                <div
                  key={decision.id}
                  className={`rounded-2xl border p-4 ${
                    decision.verdict === "ALLOW"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${
                        decision.verdict === "ALLOW" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500"
                      }`}
                    >
                      {decision.verdict}
                    </span>
                    <span className="font-mono text-xs">{decision.intent}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      HTTP {decision.httpStatus}
                    </span>
                  </div>
                  <code className="mt-2 block font-mono text-xs">
                    executeGuarded → HF {formatHealthFactor(decision.resultingHealthFactor)}
                    {config.healthFactorFloor === "" ? "" : `, floor ${formatHealthFactor(config.healthFactorFloor)}`}
                    {decision.gasEstimate ? `, gas ${decision.gasEstimate}` : ""}
                  </code>
                  {decision.revertReason ? (
                    <code className="mt-1 block break-all font-mono text-xs text-red-500">
                      {decision.revertReason}
                    </code>
                  ) : null}
                  {decision.failureKind ? (
                    <code className="mt-1 block font-mono text-xs text-muted-foreground">
                      failureKind {decision.failureKind}
                    </code>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 font-mono text-xs">
              {probe.reason ?? "no live simulation ran"}
            </p>
          )}
        </section>

        <section id="transactions" aria-labelledby="tx-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="tx-heading">
            Transactions
          </h2>
          {txPayload.transactions.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-border p-4 font-mono text-xs text-muted-foreground">
              none{txPayload.storeConfigured ? "" : " — DATABASE_URL not set, no seeds configured"}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {txPayload.transactions.map((tx) => (
                <li key={tx.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs">{tx.label}</span>
                    {tx.executionId ? (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">
                        {tx.executionId}
                      </span>
                    ) : null}
                  </div>
                  {tx.hash ? (
                    <a
                      href={`${config.explorer}/tx/${tx.hash}`}
                      className="mt-1 inline-block break-all font-mono text-xs text-accent underline underline-offset-2"
                    >
                      {shorten(tx.hash, 18, 12)}
                    </a>
                  ) : (
                    <p className="mt-1 font-mono text-xs italic text-muted-foreground">no tx hash yet</p>
                  )}
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{tx.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="holds" aria-labelledby="holds-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="holds-heading">
            Holds
          </h2>
          {!holdsPayload.configured ? (
            <p className="mt-3 rounded-2xl border border-border p-4 font-mono text-xs text-muted-foreground">
              {holdsPayload.reason ?? "NOYEET_GATEWAY_URL not set"}
            </p>
          ) : holds.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-border p-4 font-mono text-xs text-muted-foreground">
              queue empty
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {holds.map((hold) => (
                <li key={hold.holdId ?? hold.intentId ?? "hold"} className="rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">{hold.intentId ?? "intent"}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">
                      {hold.status ?? "held"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {hold.holdId ?? ""}
                    {hold.at ? ` at ${hold.at}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="verify" aria-labelledby="verify-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="verify-heading">
            Verifier
          </h2>
          <div className="mt-3">
            <Verifier />
          </div>
        </section>

        <section id="operations" aria-labelledby="ops-heading">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="ops-heading">
            Operations
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {endpoints.map((endpoint) => (
              <a
                key={endpoint}
                href={endpoint}
                className="rounded-full border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:bg-foreground/5"
              >
                {endpoint}
              </a>
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-4 font-mono text-xs text-muted-foreground">
          {config.guardAddress === ""
            ? "no guard configured"
            : `guard ${shorten(config.guardAddress, 8, 6)} · ${config.chainName === "" ? "unconfigured chain" : config.chainName}`}
        </footer>
      </div>
    </div>
  );
}
