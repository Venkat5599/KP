import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { parsePolicy, type EvalContext, type Intent, type Policy } from "@noyeet/policy";
import { KeeperHubClient } from "@noyeet/keeperhub";
import { hashJson, type Hex } from "@noyeet/receipts";
import { CircuitBreaker, CircuitOpenError, STATE_CODE } from "@noyeet/resilience";
import {
  createProducer,
  EVENT_VERSION,
  TOPICS,
  type DecisionEvent,
  type EventProducer,
} from "@noyeet/events";
import { Registry } from "@noyeet/observability";
import {
  currentTraceparent,
  initTelemetry,
  shutdownTelemetry,
  withSpan,
  type Tracer,
} from "@noyeet/telemetry";

import { loadConfig, ConfigError, type GatewayConfig } from "./config.ts";
import { authorize } from "./authorize.ts";
import {
  authorizations,
  authorizationDuration,
  breakerState,
  dependencyUp,
  eventsPublished,
  registry,
  simulationDuration,
  upstreamFailures,
} from "./metrics.ts";

/**
 * The authorization service.
 *
 * Three properties are load-bearing and each is easy to break by accident.
 *
 * **A failure to reach the simulator is a DENY, never an ALLOW.** An open breaker means the
 * post-state of a transaction cannot be predicted, and refusing to authorize an unpredictable
 * transaction is the entire product. Every catch in the request path resolves downward, and
 * the ALLOW verdict is only ever produced by `authorize()` itself.
 *
 * **A failure to publish an event is not a failure to decide.** The verdict is computed and
 * returned even if the log is unreachable; the publish failure raises a metric and shows in
 * readiness. Inverting that would let a broker outage stop an agent from being told no.
 *
 * **`/healthz` and `/readyz` answer different questions.** Liveness asks whether to restart
 * the process; readiness asks whether to route traffic to it. Wiring liveness to a dependency
 * is how a dependency blip becomes a restart loop.
 */

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

export interface Deps {
  readonly config: GatewayConfig;
  readonly policy: Policy;
  readonly policyHash: Hex;
  readonly client: Pick<KeeperHubClient, "simulateContractCall">;
  readonly breaker: CircuitBreaker;
  readonly producer: EventProducer | null;
  readonly tracer: Tracer;
  readonly startedAt: number;
}

/** Structured JSON on one line. Config is never interpolated; secrets stay out of logs. */
export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  process.stdout.write(
    `${JSON.stringify({ level, message, ...fields, at: new Date().toISOString() })}\n`,
  );
}

/** Validate the request body before it reaches the pure policy VM. */
function parseIntent(body: unknown): { ok: true; intent: Intent } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b["id"] !== "string" || b["id"] === "") {
    return { ok: false, error: "id must be a non-empty string" };
  }
  if (typeof b["chainId"] !== "number") return { ok: false, error: "chainId must be a number" };
  if (!Array.isArray(b["calls"])) return { ok: false, error: "calls must be an array" };
  if (!Array.isArray(b["invariants"])) return { ok: false, error: "invariants must be an array" };

  return {
    ok: true,
    intent: {
      ...(b as unknown as Intent),
      submittedAt:
        typeof b["submittedAt"] === "string" ? b["submittedAt"] : new Date().toISOString(),
    },
  };
}

/** Publish, but never let a log outage change a verdict that was already computed. */
async function publish(deps: Deps, event: DecisionEvent): Promise<void> {
  if (deps.producer === null) return;
  try {
    await deps.producer.emitDecision(event);
    eventsPublished.inc({ topic: TOPICS.DECISIONS, outcome: "ok" });
  } catch (error) {
    eventsPublished.inc({ topic: TOPICS.DECISIONS, outcome: "error" });
    log("error", "failed to publish decision event", {
      intentId: event.intentId,
      error: (error as Error).message,
    });
  }
}

export function buildApp(deps: Deps): Hono {
  const app = new Hono();

  app.get("/healthz", (c) =>
    c.json({ status: "ok", uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000) }),
  );

  /**
   * Readiness. The breaker counts as a dependency: while it is open the service cannot
   * produce an ALLOW for anybody, so it should not be receiving traffic that expects one.
   */
  app.get("/readyz", (c) => {
    const breakerClosed = deps.breaker.current !== "open";
    const logReady = deps.producer === null || deps.producer.connected;

    dependencyUp.set(breakerClosed ? 1 : 0, { dependency: "keeperhub" });
    dependencyUp.set(logReady ? 1 : 0, { dependency: "event_log" });

    const ready = breakerClosed && logReady;
    return c.json(
      {
        ready,
        checks: {
          keeperhub: {
            ok: breakerClosed,
            breaker: deps.breaker.current,
            retryAfterMs: deps.breaker.retryAfterMs,
          },
          eventLog: { ok: logReady, enabled: deps.producer !== null },
        },
      },
      ready ? 200 : 503,
    );
  });

  app.get("/metrics", (c) => {
    breakerState.set(deps.breaker.code);
    return c.text(registry.render(), 200, { "content-type": Registry.CONTENT_TYPE });
  });

  app.post("/authorize", async (c) => {
    const started = Date.now();

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ verdict: "DENY", error: "Body is not valid JSON" }, 400);
    }

    const parsed = parseIntent(body);
    if (!parsed.ok) return c.json({ verdict: "DENY", error: parsed.error }, 400);
    const intent = parsed.intent;
    const raw = body as Record<string, unknown>;

    // History and known counterparties are supplied per request rather than fetched, so the
    // policy VM keeps its defining property: it reads nothing on its own.
    const context: EvalContext = {
      now: new Date(),
      history: Array.isArray(raw["history"]) ? (raw["history"] as EvalContext["history"]) : [],
      knownCounterparties: Array.isArray(raw["knownCounterparties"])
        ? (raw["knownCounterparties"] as EvalContext["knownCounterparties"])
        : [],
    };

    try {
      const result = await withSpan(
        deps.tracer,
        "noyeet.authorize",
        { "noyeet.intent_id": intent.id, "noyeet.chain_id": intent.chainId },
        async (span) => {
          const simStart = Date.now();
          const outcome = await authorize(intent, context, {
            client: deps.client,
            policy: deps.policy,
            policyHash: deps.policyHash,
            guard: deps.config.guard,
            guardAbi: GUARD_ABI,
            now: () => new Date(),
          });
          if (outcome.simulation !== null) {
            simulationDuration.observe((Date.now() - simStart) / 1000);
          }
          span.setAttribute("noyeet.verdict", outcome.verdict);
          span.setAttribute("noyeet.digest", outcome.digest);
          return outcome;
        },
      );

      authorizations.inc({
        verdict: result.verdict,
        simulated: String(result.simulation !== null),
      });

      const traceparent = currentTraceparent();
      await publish(deps, {
        v: EVENT_VERSION,
        type: "decision",
        intentId: intent.id,
        chainId: intent.chainId,
        verdict: result.verdict,
        digest: result.digest,
        policyHash: deps.policyHash,
        guard: deps.config.guard,
        reasons: result.receipt.reasons.map((r) => ({
          code: r.code,
          severity: r.severity,
          message: r.message,
        })),
        simulated:
          result.simulation === null
            ? null
            : {
                wouldRevert: result.simulation.wouldRevert,
                gasEstimate: result.receipt.simulation?.gasEstimate ?? "0",
                ...(result.simulation.denial?.kind === "invariant"
                  ? { invariantIndex: result.simulation.denial.index }
                  : {}),
              },
        ...(traceparent === undefined ? {} : { traceparent }),
        at: result.receipt.at,
      });

      return c.json(
        { verdict: result.verdict, digest: result.digest, receipt: result.receipt },
        result.verdict === "DENY" ? 403 : 200,
      );
    } catch (error) {
      /**
       * The fail-closed path. An open circuit means the simulator is unreachable, so the
       * post-state is unknown, and the only safe answer is refusal. This is why the breaker
       * here is a safety mechanism rather than only a latency one.
       */
      if (error instanceof CircuitOpenError) {
        authorizations.inc({ verdict: "DENY", simulated: "false" });
        upstreamFailures.inc({ kind: "circuit_open" });
        breakerState.set(STATE_CODE.open);
        log("warn", "authorization refused: circuit open", { intentId: intent.id });
        return c.json(
          {
            verdict: "DENY",
            reason: "SIMULATOR_UNAVAILABLE",
            message:
              "The preflight simulator is unreachable, so the resulting state cannot be predicted. Refusing.",
            retryAfterMs: error.retryAfterMs,
          },
          503,
          { "retry-after": String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))) },
        );
      }

      const kind = (error as { kind?: string }).kind ?? "unknown";
      upstreamFailures.inc({ kind });
      authorizations.inc({ verdict: "DENY", simulated: "false" });
      log("error", "authorization failed", {
        intentId: intent.id,
        kind,
        error: (error as Error).message,
      });

      return c.json(
        { verdict: "DENY", reason: "AUTHORIZATION_ERROR", message: (error as Error).message },
        502,
      );
    } finally {
      authorizationDuration.observe((Date.now() - started) / 1000);
      breakerState.set(deps.breaker.code);
    }
  });

  return app;
}

export async function main(): Promise<void> {
  let config: GatewayConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      log("error", error.message);
      process.exit(78); // EX_CONFIG
    }
    throw error;
  }

  const policy = parsePolicy(JSON.parse(await readFile(config.policyPath, "utf8")) as unknown);
  // The hash of the policy actually in force, committed alongside every receipt. Taken from
  // the parsed object rather than the file bytes, so reformatting the file cannot change it.
  const policyHash = hashJson(policy as never);

  const tracer = initTelemetry({
    serviceName: "noyeet-gateway",
    serviceVersion: config.serviceVersion,
    endpoint: config.otlp.endpoint,
    enabled: config.otlp.enabled,
  });

  const breaker = new CircuitBreaker({
    failureThreshold: config.breaker.failureThreshold,
    cooldownMs: config.breaker.cooldownMs,
    successThreshold: config.breaker.successThreshold,
    onStateChange: (from, to) => log("warn", "circuit breaker state change", { from, to }),
  });

  const client = new KeeperHubClient({
    apiKey: config.keeperhub.apiKey,
    baseUrl: config.keeperhub.baseUrl,
    breaker,
  });

  let producer: EventProducer | null = null;
  if (config.kafka.enabled) {
    producer = createProducer({ brokers: config.kafka.brokers, clientId: "noyeet-gateway" });
    try {
      await producer.connect();
      log("info", "connected to the event log", { brokers: config.kafka.brokers.join(",") });
    } catch (error) {
      // Degraded, not dead. Decisions still happen; they are simply not durable yet, and
      // /readyz reports exactly that.
      log("error", "event log unreachable at boot, running degraded", {
        error: (error as Error).message,
      });
    }
  }

  const deps: Deps = {
    config,
    policy,
    policyHash,
    client,
    breaker,
    producer,
    tracer,
    startedAt: Date.now(),
  };

  const server = serve({ fetch: buildApp(deps).fetch, port: config.port });
  log("info", "gateway listening", { port: config.port, guard: config.guard, policyHash });

  const shutdown = async (signal: string): Promise<void> => {
    log("info", "shutting down", { signal });
    server.close();
    await producer?.disconnect().catch(() => undefined);
    await shutdownTelemetry((error) =>
      log("warn", "trace flush failed on shutdown", { error: error.message }),
    );
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (import.meta.main) await main();
