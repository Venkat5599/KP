import { LivePanel } from "../components/LivePanel";
import { Verifier } from "../components/Verifier";
import {
  CHAIN_NAME,
  EXECUTOR_ADDRESS,
  EXPLORER,
  GUARD_ADDRESS,
  HEALTH_FACTOR_FLOOR,
  SUITES,
  TARGET_ADDRESS,
  TOTAL_TESTS,
  TRANSACTIONS,
  shorten,
} from "../lib/decisions";
import { readGuardConfig, readLedger } from "../lib/live";

/**
 * Rendered on every request. The verdict ledger and the guard configuration are read live
 * rather than baked in at build time, so what the page claims is what the systems currently
 * report. When a read fails the page says so instead of falling back to a constant.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatHealthFactor(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = ((value % 1_000_000_000_000_000_000n) / 10_000_000_000_000_000n)
    .toString()
    .padStart(2, "0");
  return `${whole}.${fraction}`;
}

export default async function Page() {
  const [ledger, chainFacts] = await Promise.all([readLedger(), readGuardConfig()]);

  const allowed = ledger.decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = ledger.decisions.filter((d) => d.verdict === "DENY").length;

  return (
    <div className="shell">
      <main className="page">
        <header className="masthead">
          <p className="eyebrow">Execution authorization on {CHAIN_NAME}</p>
          <h1 className="wordmark">noyeet</h1>
          <p className="thesis">
            Agents do not get keys. They get permits, decided by what the chain says will
            happen and enforced atomically when it does.
          </p>
        </header>

        <section className="ledger" aria-labelledby="ledger-heading">
          <h2 className="section-head" id="ledger-heading">
            The verdict ledger
          </h2>
          <p className="lede">
            Both calls below hit the same contract, through the same function, with the same
            argument type. Only the state they would produce differs. Every calldata-level
            guardrail passes both.
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
                      {formatHealthFactor(decision.resultingHealthFactor)}, floor{" "}
                      {formatHealthFactor(HEALTH_FACTOR_FLOOR)}
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
                <span className="stamp">read at {ledger.at.slice(11, 19)} UTC</span>
              </p>
            </>
          ) : (
            <p className="panel-note panel-note-bad">
              The ledger could not be read, so nothing is shown here rather than a stale
              copy. {ledger.reason}
            </p>
          )}
        </section>

        <section aria-labelledby="how-heading">
          <h2 className="section-head" id="how-heading">
            Why the refusal is possible
          </h2>
          <p className="body">
            Simulation returns a gas estimate and a revert flag, not a state diff, so
            post-state cannot be read directly. So the invariant is expressed as a revert
            condition inside the transaction itself. A guard contract runs the agent{"'"}s
            calls, asserts the post-state, and reverts if a bound breaks.
          </p>
          <p className="body">
            Simulating that composite predicts the outcome. Broadcasting the same composite
            enforces it. If state moves between the two, the transaction reverts rather than
            doing damage, because prediction and enforcement are the same code path.
          </p>

          <dl className="facts">
            <div>
              <dt>Guard</dt>
              <dd>
                <a href={`${EXPLORER}/address/${GUARD_ADDRESS}`}>{GUARD_ADDRESS}</a>
              </dd>
            </div>
            <div>
              <dt>Target read by the invariant</dt>
              <dd>
                <a href={`${EXPLORER}/address/${TARGET_ADDRESS}`}>{TARGET_ADDRESS}</a>
              </dd>
            </div>
            <div>
              <dt>Executor</dt>
              <dd>{EXECUTOR_ADDRESS}</dd>
            </div>
            {chainFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="tx-heading">
          <h2 className="section-head" id="tx-heading">
            Transactions
          </h2>
          <ul className="txs">
            {TRANSACTIONS.map((tx) => (
              <li className="tx" key={tx.hash}>
                <div className="tx-head">
                  <span className="tx-label">{tx.label}</span>
                  {tx.throughKeeperHub ? (
                    <span className="chip chip-strong">executed through KeeperHub</span>
                  ) : null}
                </div>
                <a className="tx-hash" href={`${EXPLORER}/tx/${tx.hash}`}>
                  {shorten(tx.hash, 18, 12)}
                </a>
                <p className="tx-detail">{tx.detail}</p>
                {tx.executionId ? (
                  <span className="chip">executionId {tx.executionId}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="verify-heading">
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

        <section aria-labelledby="ops-heading">
          <h2 className="section-head" id="ops-heading">
            Operations
          </h2>
          <p className="body">
            Prometheus scrapes <code>/api/metrics</code>, where every scrape performs the
            same two simulations shown above. The health gauge asserts both directions,
            because a guard that refuses everything is broken in a way a single check would
            score as healthy.
          </p>
          <ul className="suites">
            {SUITES.map((suite) => (
              <li className="suite" key={suite.name}>
                <span className="suite-count">{suite.tests}</span>
                <span className="suite-name">{suite.name}</span>
                <span className="suite-detail">{suite.detail}</span>
              </li>
            ))}
          </ul>
          <p className="tally">
            <span className="tally-figure">{TOTAL_TESTS}</span> tests, zero failing
          </p>
        </section>

        <footer className="footer">
          <p className="colophon">
            Guard {shorten(GUARD_ADDRESS, 8, 6)} on {CHAIN_NAME}
          </p>
          <p className="colophon">
            The ledger and the guard configuration on this page are read live on every
            request. Transaction hashes are checkable on Etherscan.
          </p>
        </footer>
      </main>

      <LivePanel />
    </div>
  );
}
