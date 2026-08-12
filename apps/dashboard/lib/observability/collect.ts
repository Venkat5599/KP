import { Registry } from "./registry";

/**
 * Metric collection.
 *
 * Every series below comes from a request made while the scrape was being served: a live
 * guard simulation through KeeperHub, and a live auth check. Nothing is cached, seeded, or
 * replayed.
 *
 * When an upstream call fails, the failure becomes its own series rather than a quietly
 * omitted one. A missing series and a healthy zero look identical on a dashboard and mean
 * opposite things.
 */

export interface CollectOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly chainId: number;
  readonly guard: string;
  readonly target: string;
  readonly floorWei: string;
  /** Injected for testability; defaults to the platform fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

const GUARD_ABI = JSON.stringify([
  {
    type: "function",
    name: "executeGuarded",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "inv",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "probe", type: "bytes" },
          { name: "word", type: "uint8" },
          { name: "op", type: "uint8" },
          { name: "threshold", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
]);

const BORROW_MORE = "0x9d0bf2e9";
const GET_USER_ACCOUNT_DATA = "0xbf92857c";

function borrowMore(amountWei: bigint): string {
  return `${BORROW_MORE}${amountWei.toString(16).padStart(64, "0")}`;
}

function probeCalldata(guard: string): string {
  return `${GET_USER_ACCOUNT_DATA}${guard.slice(2).toLowerCase().padStart(64, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export interface CollectResult {
  readonly body: string;
  readonly contentType: string;
}

export async function collectMetrics(options: CollectOptions): Promise<CollectResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const clock = options.now ?? (() => Date.now());
  const registry = new Registry();

  const decisions = registry.counter(
    "noyeet_decisions_total",
    "Authorization decisions observed during this scrape, by verdict.",
  );
  const denialReasons = registry.counter(
    "noyeet_denial_reasons_total",
    "Denials by machine-readable reason code.",
  );
  const upstreamFailures = registry.counter(
    "noyeet_upstream_failures_total",
    "Calls to KeeperHub that could not be completed, by kind.",
  );
  const guardHealthy = registry.gauge(
    "noyeet_guard_healthy",
    "1 when the guard permits a safe intent and refuses an unsafe one, 0 otherwise.",
  );
  const authOk = registry.gauge(
    "noyeet_keeperhub_authenticated",
    "1 when the configured API key authenticates against KeeperHub.",
  );
  const gasEstimate = registry.gauge(
    "noyeet_gas_estimate_units",
    "Gas the guard-wrapped call is estimated to consume, by outcome.",
  );
  const latency = registry.histogram(
    "noyeet_simulation_duration_seconds",
    "Wall-clock duration of a guard simulation through KeeperHub.",
    [0.25, 0.5, 1, 2, 4, 8, 16],
  );
  const invariantMargin = registry.gauge(
    "noyeet_invariant_margin_wei",
    "Distance between the required bound and the observed value on the refused intent.",
  );

  async function simulate(
    outcome: "permitted" | "refused",
    resultingHealthFactor: bigint,
  ): Promise<void> {
    const started = clock();
    try {
      const response = await doFetch(`${options.baseUrl}/api/execute/contract-call`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chainId: options.chainId,
          contractAddress: options.guard,
          functionName: "executeGuarded",
          abi: GUARD_ABI,
          functionArgs: JSON.stringify([
            [[options.target, "0", borrowMore(resultingHealthFactor)]],
            [[options.target, probeCalldata(options.guard), 5, 0, options.floorWei]],
          ]),
          simulate: true,
        }),
        cache: "no-store",
      });

      latency.observe((clock() - started) / 1000, { outcome });

      const payload = asRecord(await response.json().catch(() => ({})));
      const wouldRevert = payload["wouldRevert"] === true;
      decisions.inc({ verdict: wouldRevert ? "DENY" : "ALLOW", outcome });

      const estimate = payload["gasEstimate"];
      if (typeof estimate === "string" && /^\d+$/.test(estimate)) {
        gasEstimate.set(Number(estimate), { outcome });
      }

      if (wouldRevert) {
        const reason = typeof payload["revertReason"] === "string" ? payload["revertReason"] : "";
        const failureKind =
          typeof payload["failureKind"] === "string" ? payload["failureKind"] : "unknown";

        // A guard denial and a preflight rejection are different events. Collapsing them
        // would make an unfunded wallet look like an unsafe position on the dashboard.
        const match = /NOYEET\/1:INV:(\d+):(\d+):(\d+)/.exec(reason);
        if (match) {
          denialReasons.inc({ code: "INVARIANT_BROKEN", index: match[1]! });
          invariantMargin.set(Number(BigInt(match[3]!) - BigInt(match[2]!)), { index: match[1]! });
        } else {
          denialReasons.inc({
            code: failureKind === "validation" ? "PREFLIGHT_REJECTED" : "SIMULATION_REVERTED",
          });
        }
      }
    } catch (error) {
      latency.observe((clock() - started) / 1000, { outcome });
      upstreamFailures.inc({
        kind: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network",
      });
    }
  }

  // The safe intent must be permitted and the unsafe one refused. Asserting both directions
  // is what makes the health gauge meaningful: a guard that refuses everything is broken in
  // a way a single check would score as healthy.
  await Promise.all([
    simulate("permitted", 1_500_000_000_000_000_000n),
    simulate("refused", 1_120_000_000_000_000_000n),
  ]);

  const permitted = decisions.get({ verdict: "ALLOW", outcome: "permitted" });
  const refused = decisions.get({ verdict: "DENY", outcome: "refused" });
  guardHealthy.set(permitted > 0 && refused > 0 ? 1 : 0);

  try {
    const response = await doFetch(`${options.baseUrl}/api/user`, {
      headers: { authorization: `Bearer ${options.apiKey}` },
      cache: "no-store",
    });
    authOk.set(response.status === 200 ? 1 : 0);
    if (response.status === 401) upstreamFailures.inc({ kind: "unauthorized" });
  } catch {
    authOk.set(0);
    upstreamFailures.inc({ kind: "network" });
  }

  return { body: registry.render(), contentType: Registry.CONTENT_TYPE };
}
