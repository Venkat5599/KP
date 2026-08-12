import { LivePanel } from "../components/LivePanel";
import { Verifier } from "../components/Verifier";
import { loadConfig } from "../lib/env";
import { formatHealthFactor, formatTime, shorten } from "../lib/format";
import { readGuardConfig } from "../lib/live";
import { runProbe } from "../lib/probe";
import { computeHealth } from "../lib/health";
import { listTransactions } from "../lib/transactions";
import { listHolds } from "../lib/holds";

/**
 * Rendered on every request. The ledger, the guard configuration and the health
 * status are read live; nothing on this page is baked in at build time and nothing
 * is a recorded value dressed as live. When a read fails the page says so instead
 * of falling back to a constant. Configuration (addresses, chain, floor) comes from
 * the environment, not from literals. All reads are direct library calls — the page
 * never fetches its own deployment (Vercel serverless cannot serve self-fetches).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthFact {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export default async function Page() {
  const config = loadConfig();
  const [probe, txPayload, holdsPayload] = await Promise.all([
    runProbe(),
    listTransactions(),
    listHolds(),
  ]);
  const [chainFacts, health] = await Promise.all([
    readGuardConfig(config),
    computeHealth(probe),
  ]);

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

  return (
    <div className="shell">
      <main className="page">
        <header className="masthead">
          <p className="eyebrow">
            Execution authorization on {config.chainName === "" ? "an unconfigured chain" : config.chainName}
          </p>
          <h1 className="wordmark">noyeet</h1>
          <p className="thesis">
            Agents do not get keys. They get permits, decided by what the chain says will
            happen and enforced atomically when it does.
          </p>
        </header>

        <section className="status-strip" aria-label="Live health">
          {healthFacts.map((fact) => (
            <div className={`status-chip ${fact.ok ? "status-ok" : "status-bad"}`} key={fact.label}>
              <span className="status-label">{fact.label}</span>
              <span className="status-detail">{fact.detail}</span>
            </div>
          ))}
        </section>

        <nav className="dash-nav" aria-label="Dashboard sections">
          <a href="#guard">Guard</a>
          <a href="#ledger">Ledger</a>
          <a href="#transactions">Transactions</a>
          <a href="#holds">Holds</a>
          <a href="#verify">Verifier</a>
          <a href="#operations">Operations</a>
        </nav>

        <section aria-labelledby="guard-heading" id="guard">
          <h2 className="section-head" id="guard-heading">
            Guard
          </h2>
          <p className="body">
            The contract addresses are configuration; the admin and the executor check are
            read from the contract on every request.
          </p>
          <dl className="facts">
            {facts.map((fact) => (
              <div key={`${fact.source}-${fact.label}`}>
                <dt>{fact.label}</dt>
                <dd>
                  {fact.source === "configuration" && config.explorer !== "" ? (
                    <a href={`${config.explorer}/address/${fact.value}`}>{fact.value}</a>
                  ) : (
                    fact.value
                  )}
                  <span className="fact-source">{fact.source === "chain" ? "read from the contract" : "configured"}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="ledger" aria-labelledby="ledger-heading" id="ledger">
          <h2 className="section-head" id="ledger-heading">
            The verdict ledger
          </h2>
          <p className="lede">
            Both calls below hit the same contract, through the same function, with the same
            argument type. Only the state they would produce differs. Every calldata-level
            guardrail passes both. The pair is simulated live against the deployed guard on
            every request; it is never a replay of recorded values.
          </p>

          {ledger.ok ? (
            <>
              <ol className="rows">
                {ledger.decisions.map((decision) => (
                  <li className={`row row-${decision.verdict.toLowerCase()}`} key={decision.id}>
                    <div className="row-head">
                      <span className={`verdict verdict-${decision.verdict.toLowerCase()}`}>
                        {decision.verdict}
                      </span>
                      <span className="intent">{decision.intent}</span>
                      <span className="status">HTTP {decision.httpStatus}</span>
                    </div>

                    <code className="calldata">
                      executeGuarded, ending at health factor{" "}
                      {formatHealthFactor(decision.resultingHealthFactor)}
                      {config.healthFactorFloor === ""
                        ? ""
                        : `, floor ${formatHealthFactor(config.healthFactorFloor)}`}
                    </code>

                    {decision.revertReason ? (
                      <code className="reason">{decision.revertReason}</code>
                    ) : null}

                    <div className="row-foot">
                      {decision.failureKind ? (
                        <span className="chip">failureKind: {decision.failureKind}</span>
                      ) : null}
                      {decision.gasEstimate ? (
                        <span className="chip">gas {decision.gasEstimate}</span>
                      ) : null}
                      <span className="note">
                        {decision.verdict === "ALLOW"
                          ? "The post-state satisfies the floor, so the guard permits execution."
                          : "Structurally legal calldata. The simulated post-state breaks the invariant."}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="tally">
                <span className="tally-figure">{allowed}</span> permitted
                <span className="tally-sep" aria-hidden="true">
                  /
                </span>
                <span className="tally-figure">{refused}</span> refused
                <span className="stamp">read at {formatTime(ledger.at)} UTC</span>
              </p>
            </>
          ) : (
            <p className="panel-note panel-note-bad">
              The ledger could not be read, so nothing is shown here rather than a stale
              copy. {ledger.reason}
            </p>
          )}
        </section>

        <section aria-labelledby="tx-heading" id="transactions">
          <h2 className="section-head" id="tx-heading">
            Transactions
          </h2>
          <p className="body">
            Receipts from the store when it is configured, merged with the seed
            transactions configured for this deployment. Nothing is invented: an empty
            list is an honest empty list.
          </p>
          {txPayload.transactions.length === 0 ? (
            <p className="panel-note panel-note-bad">
              No transactions to show.{" "}
              {txPayload.storeConfigured
                ? "The store is connected but holds no receipts yet."
                : "The store is not configured (DATABASE_URL) and no seed transactions are set (NOYEET_SEED_TRANSACTIONS)."}
            </p>
          ) : (
            <ul className="txs">
              {txPayload.transactions.map((tx) => (
                <li className="tx" key={tx.id}>
                  <div className="tx-head">
                    <span className="tx-label">{tx.label}</span>
                    {tx.executionId ? <span className="chip chip-strong">executionId {tx.executionId}</span> : null}
                  </div>
                  {tx.hash ? (
                    <a className="tx-hash" href={`${config.explorer}/tx/${tx.hash}`}>
                      {shorten(tx.hash, 18, 12)}
                    </a>
                  ) : (
                    <span className="tx-hash tx-hash-pending">no transaction hash yet</span>
                  )}
                  <p className="tx-detail">{tx.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="holds-heading" id="holds">
          <h2 className="section-head" id="holds-heading">
            Holds
          </h2>
          <p className="body">
            Intents escalated to a human gate, read live from the gateway. A release or
            cancel is an operator decision; the guard still asserts at inclusion.
          </p>
          {!holdsPayload.configured ? (
            <p className="panel-note panel-note-bad">
              No gateway configured ({holdsPayload.reason ?? "NOYEET_GATEWAY_URL not set"}).
            </p>
          ) : holds.length === 0 ? (
            <p className="panel-note">The hold queue is empty right now.</p>
          ) : (
            <ul className="txs">
              {holds.map((hold) => (
                <li className="tx" key={hold.holdId ?? hold.intentId ?? "hold"}>
                  <div className="tx-head">
                    <span className="tx-label">{hold.intentId ?? "intent"}</span>
                    <span className="chip">{hold.status ?? "held"}</span>
                  </div>
                  <p className="tx-detail">
                    {hold.holdId ?? ""}
                    {hold.at ? ` at ${hold.at}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="verify-heading" id="verify">
          <h2 className="section-head" id="verify-heading">
            Verify a receipt
          </h2>
          <p className="body">
            Every decision, including a refusal, produces a receipt. The digest is computed
            over the RFC 8785 canonical form, so property order cannot change it and two
            implementations agree byte for byte. This runs entirely in the browser.
          </p>
          <Verifier />
        </section>

        <section aria-labelledby="ops-heading" id="operations">
          <h2 className="section-head" id="ops-heading">
            Operations
          </h2>
          <p className="body">
            Prometheus scrapes <code>/api/metrics</code>, where every scrape performs the
            same two simulations shown above. The health gauge asserts both directions,
            because a guard that refuses everything is broken in a way a single check would
            score as healthy. Machine-readable status lives at <code>/api/health</code>.
          </p>
        </section>

        <footer className="footer">
          <p className="colophon">
            {config.guardAddress === ""
              ? "No guard configured"
              : `Guard ${shorten(config.guardAddress, 8, 6)} on ${config.chainName === "" ? "an unconfigured chain" : config.chainName}`}
          </p>
          <p className="colophon">
            The ledger, the guard configuration and the health status on this page are read
            live on every request. Nothing is cached, nothing is recorded value.
          </p>
        </footer>
      </main>

      <LivePanel />
    </div>
  );
}
