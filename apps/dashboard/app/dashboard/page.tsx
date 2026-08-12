import { Verifier } from "@/components/verifier";
import { loadConfig } from "@/lib/env";
import { formatHealthFactor, formatTime, shorten } from "@/lib/format";
import { readGuardConfig } from "@/lib/live";
import { runProbe } from "@/lib/probe";
import { computeHealth } from "@/lib/health";
import { listTransactions } from "@/lib/transactions";
import { listHolds } from "@/lib/holds";
import { createMetadata, siteConfig } from "@/lib/metadata";
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

  const ledger = {
    ok: probe.live && probe.results !== undefined,
    reason: probe.live ? undefined : (probe.reason ?? "The live probe reported no results."),
    decisions:
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
      })) ?? [],
    at: probe.at,
  };

  const allowed = ledger.decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = ledger.decisions.filter((d) => d.verdict === "DENY").length;

  const healthFacts: readonly HealthFact[] = [
    {
      label: "Live probe",
      ok: health.probe.live,
      detail: health.probe.live
        ? `simulations answered at ${formatTime(probe.at)} UTC`
        : (health.probe.reason ?? "no live simulation ran"),
    },
    {
      label: "Guard on chain",
      ok: health.guard.reachable && config.guardAddress !== "",
      detail:
        config.guardAddress === ""
          ? "NOYEET_GUARD_ADDRESS not set"
          : health.guard.reachable
            ? "admin() answered"
            : "RPC unreachable",
    },
    {
      label: "Receipt store",
      ok: health.store.configured,
      detail: health.store.configured
        ? `Postgres connected${health.store.receipts !== null ? `, ${health.store.receipts} receipt(s)` : ""}`
        : "DATABASE_URL not set",
    },
    {
      label: "Hold gateway",
      ok: health.gateway.configured,
      detail: health.gateway.configured ? "NOYEET_GATEWAY_URL set" : "NOYEET_GATEWAY_URL not set",
    },
  ];

  const facts: readonly { label: string; value: string; source: "chain" | "configuration" }[] = [
    ...(config.guardAddress === ""
      ? []
      : [{ label: "Guard", value: config.guardAddress, source: "configuration" as const }]),
    ...(config.targetAddress === ""
      ? []
      : [{ label: "Target read by the invariant", value: config.targetAddress, source: "configuration" as const }]),
    ...(config.executorAddress === ""
      ? []
      : [{ label: "Executor", value: config.executorAddress, source: "configuration" as const }]),
    ...(config.chainName === "" ? [] : [{ label: "Chain", value: config.chainName, source: "configuration" as const }]),
    ...(config.healthFactorFloor === ""
      ? []
      : [{ label: "Health factor floor", value: formatHealthFactor(config.healthFactorFloor), source: "configuration" as const }]),
    ...chainFacts.map((fact) => ({ label: fact.label, value: fact.value, source: "chain" as const })),
  ];

  const holds = Array.isArray(holdsPayload.holds)
    ? (holdsPayload.holds as readonly { holdId?: string; intentId?: string; status?: string; at?: string }[])
    : [];

  const nav = [
    { href: "#guard", label: "Guard" },
    { href: "#ledger", label: "Verdict ledger" },
    { href: "#transactions", label: "Transactions" },
    { href: "#holds", label: "Holds" },
    { href: "#verify", label: "Verifier" },
    { href: "#operations", label: "Operations" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-64 md:shrink-0">
        <div className="md:sticky md:top-24 flex flex-col gap-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">noyeet</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything on this page is read live. Nothing is cached, nothing is a
              recorded value.
            </p>
          </div>

          <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Dashboard">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              ← Landing
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
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          <h2 className="text-xl font-semibold tracking-tight" id="guard-heading">
            Guard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Addresses are configuration; the admin and the executor check are read from
            the contract on every request.
          </p>
          <dl className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {facts.map((fact) => (
              <div key={`${fact.source}-${fact.label}`} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                <dd className="break-all font-mono text-sm">
                  {fact.source === "configuration" && config.explorer !== "" ? (
                    <a href={`${config.explorer}/address/${fact.value}`} className="text-accent underline underline-offset-2">
                      {fact.value}
                    </a>
                  ) : (
                    fact.value
                  )}
                  <span className="ml-2 text-xs text-muted-foreground/60">
                    {fact.source === "chain" ? "· read from the contract" : "· configured"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="ledger" aria-labelledby="ledger-heading">
          <h2 className="text-xl font-semibold tracking-tight" id="ledger-heading">
            Verdict ledger
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two calls, one contract, one function, one argument type. Only the state they
            would produce differs. Simulated live against the deployed guard on every
            request.
          </p>
          {ledger.ok ? (
            <div className="mt-4 space-y-4">
              {ledger.decisions.map((decision) => (
                <div
                  key={decision.id}
                  className={`rounded-2xl border p-5 ${
                    decision.verdict === "ALLOW"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${
                        decision.verdict === "ALLOW" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500"
                      }`}
                    >
                      {decision.verdict}
                    </span>
                    <span className="text-sm font-medium">{decision.intent}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      HTTP {decision.httpStatus}
                    </span>
                  </div>
                  <code className="mt-3 block font-mono text-xs">
                    executeGuarded, ending at health factor {formatHealthFactor(decision.resultingHealthFactor)}
                    {config.healthFactorFloor === "" ? "" : `, floor ${formatHealthFactor(config.healthFactorFloor)}`}
                  </code>
                  {decision.revertReason ? (
                    <code className="mt-2 block break-all font-mono text-xs text-red-500">
                      {decision.revertReason}
                    </code>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {decision.failureKind ? (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">
                        failureKind: {decision.failureKind}
                      </span>
                    ) : null}
                    {decision.gasEstimate ? (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">
                        gas {decision.gasEstimate}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">{allowed}</span> permitted
                {" / "}
                <span className="font-mono font-semibold text-foreground">{refused}</span> refused
                <span className="ml-2 font-mono text-xs">· read at {formatTime(ledger.at)} UTC</span>
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm">
              The ledger could not be read, so nothing is shown here rather than a stale
              copy. {ledger.reason}
            </p>
          )}
        </section>

        <section id="transactions" aria-labelledby="tx-heading">
          <h2 className="text-xl font-semibold tracking-tight" id="tx-heading">
            Transactions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Receipts from the store when configured, merged with the seed transactions
            configured for this deployment. Nothing is invented.
          </p>
          {txPayload.transactions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              No transactions to show.{" "}
              {txPayload.storeConfigured
                ? "The store is connected but holds no receipts yet."
                : "The store is not configured (DATABASE_URL) and no seed transactions are set (NOYEET_SEED_TRANSACTIONS)."}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {txPayload.transactions.map((tx) => (
                <li key={tx.id} className="rounded-2xl border border-border p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">{tx.label}</span>
                    {tx.executionId ? (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">
                        executionId {tx.executionId}
                      </span>
                    ) : null}
                  </div>
                  {tx.hash ? (
                    <a
                      href={`${config.explorer}/tx/${tx.hash}`}
                      className="mt-2 inline-block break-all font-mono text-xs text-accent underline underline-offset-2"
                    >
                      {shorten(tx.hash, 18, 12)}
                    </a>
                  ) : (
                    <p className="mt-2 font-mono text-xs italic text-muted-foreground">
                      no transaction hash yet
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{tx.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="holds" aria-labelledby="holds-heading">
          <h2 className="text-xl font-semibold tracking-tight" id="holds-heading">
            Holds
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Intents escalated to a human gate, read live from the gateway. Release or
            cancel is an operator decision; the guard still asserts at inclusion.
          </p>
          {!holdsPayload.configured ? (
            <p className="mt-4 rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              No gateway configured ({holdsPayload.reason ?? "NOYEET_GATEWAY_URL not set"}).
            </p>
          ) : holds.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              The hold queue is empty right now.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {holds.map((hold) => (
                <li key={hold.holdId ?? hold.intentId ?? "hold"} className="rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{hold.intentId ?? "intent"}</span>
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
          <h2 className="text-xl font-semibold tracking-tight" id="verify-heading">
            Verify a receipt
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The digest is computed over the RFC 8785 canonical form, so property order
            cannot change it and two implementations agree byte for byte. Runs entirely
            in the browser.
          </p>
          <div className="mt-4">
            <Verifier />
          </div>
        </section>

        <section id="operations" aria-labelledby="ops-heading">
          <h2 className="text-xl font-semibold tracking-tight" id="ops-heading">
            Operations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prometheus scrapes <code className="font-mono text-xs">/api/metrics</code>,
            where every scrape performs the same two simulations shown above. The health
            gauge asserts both directions, because a guard that refuses everything is
            broken in a way a single check would score as healthy. Machine-readable
            status lives at <code className="font-mono text-xs">/api/health</code>.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            <a href={`/api/health`} className="font-mono text-accent underline underline-offset-2">
              /api/health
            </a>{" "}
            ·{" "}
            <a href={`/api/metrics`} className="font-mono text-accent underline underline-offset-2">
              /api/metrics
            </a>{" "}
            ·{" "}
            <a href={`/api/transactions`} className="font-mono text-accent underline underline-offset-2">
              /api/transactions
            </a>{" "}
            ·{" "}
            <a href={`/api/holds`} className="font-mono text-accent underline underline-offset-2">
              /api/holds
            </a>
          </p>
        </section>

        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          {config.guardAddress === ""
            ? "No guard configured"
            : `Guard ${shorten(config.guardAddress, 8, 6)} on ${config.chainName === "" ? "an unconfigured chain" : config.chainName}`}
          {" · "}live reads on every request · {siteConfig.name}
        </footer>
      </div>
    </div>
  );
}
