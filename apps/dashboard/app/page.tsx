import { LivePanel } from "../components/LivePanel";
import { Verifier } from "../components/Verifier";
import {
  ADMIN_ADDRESS,
  CHAIN_NAME,
  DECISIONS,
  EXECUTOR_ADDRESS,
  EXPLORER,
  GUARD_ADDRESS,
  SUITES,
  TARGET_ADDRESS,
  TOTAL_TESTS,
  TRANSACTIONS,
  shorten,
} from "../lib/decisions";

export default function Page() {
  const allowed = DECISIONS.filter((d) => d.verdict === "ALLOW").length;
  const denied = DECISIONS.filter((d) => d.verdict === "DENY").length;

  return (
    <div className="shell">
      <main className="page">
        <header className="masthead">
          <p className="eyebrow">Execution authorization · {CHAIN_NAME}</p>
          <h1 className="wordmark">noyeet</h1>
          <p className="thesis">
            Agents do not get keys. They get permits, decided by what the chain says will
            happen and enforced atomically when it does.
          </p>
        </header>

        <section className="ledger" aria-labelledby="ledger-heading">
        <h2 className="section-head" id="ledger-heading">
          <span className="rank">01</span>The verdict ledger
        </h2>
        <p className="lede">
          Two of these calls hit the same contract, through the same function, with the same
          argument type. Only the resulting state differs. Every calldata-level guardrail
          passes both.
        </p>

        <ol className="rows">
          {DECISIONS.map((decision) => (
            <li className={`row row-${decision.verdict.toLowerCase()}`} key={decision.id}>
              <div className="row-head">
                <span className={`verdict verdict-${decision.verdict.toLowerCase()}`}>
                  {decision.verdict}
                </span>
                <span className="intent">{decision.intent}</span>
                <span className="status">HTTP {decision.httpStatus}</span>
              </div>

              <code className="calldata">{decision.calldataShape}</code>

              {decision.revertReason ? (
                <code className="reason">{decision.revertReason}</code>
              ) : null}

              <div className="row-foot">
                {decision.failureKind ? (
                  <span className="chip">failureKind: {decision.failureKind}</span>
                ) : null}
                {decision.gas ? <span className="chip">gas {decision.gas}</span> : null}
                <span className="note">{decision.note}</span>
              </div>
            </li>
          ))}
        </ol>

        <p className="tally">
          <span className="tally-figure">{allowed}</span> allowed
          <span className="tally-sep" aria-hidden="true">
            /
          </span>
          <span className="tally-figure">{denied}</span> refused
        </p>
        </section>

        <section aria-labelledby="how-heading">
        <h2 className="section-head" id="how-heading">
          <span className="rank">02</span>Why the refusal is possible
        </h2>
        <p className="body">
          Simulation returns a gas estimate and a revert flag, not a state diff, so post-state
          cannot be read directly. So the invariant is expressed as a revert condition inside
          the transaction itself. A guard contract runs the agent{"'"}s calls, asserts the
          post-state, and reverts if a bound breaks.
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
          <div>
            <dt>Admin, may only rotate executors</dt>
            <dd>{ADMIN_ADDRESS}</dd>
          </div>
        </dl>
        </section>

        <section aria-labelledby="tx-heading">
        <h2 className="section-head" id="tx-heading">
          <span className="rank">03</span>Transactions
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
          <span className="rank">04</span>Verify a receipt
        </h2>
        <p className="body">
          Every decision, including a refusal, produces a receipt. The digest is computed over
          the RFC 8785 canonical form, so property order cannot change it and two
          implementations agree byte for byte. This runs entirely in the browser.
        </p>
        <Verifier />
        </section>

        <section aria-labelledby="tests-heading">
        <h2 className="section-head" id="tests-heading">
          <span className="rank">05</span>Test suites
        </h2>
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
            noyeet · guard {shorten(GUARD_ADDRESS, 8, 6)} · {CHAIN_NAME}
          </p>
          <p className="colophon">
            Every figure on this page was returned by a live request or is checkable on
            Etherscan.
          </p>
        </footer>
      </main>

      <LivePanel />
    </div>
  );
}
