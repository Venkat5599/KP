import { Hono } from "hono";
import type { EvalContext, Intent } from "@noyeet/policy";
import { receiptDigest, type Receipt } from "@noyeet/receipts";
import { Registry } from "@noyeet/observability";
import { EVENT_VERSION, TOPICS, type DecisionEvent, type EventProducer } from "@noyeet/events";
import { currentTraceparent } from "@noyeet/telemetry";
import { authorize, toGuardCall } from "./authorize.ts";
import type { GatewayConfig } from "./config.ts";
import { HoldLedger } from "./holds.ts";
import { notifyHold } from "./notify.ts";
import {
  authorizations,
  breakerState,
  dependencyUp,
  eventsPublished,
  registry,
} from "./metrics.ts";

/**
 * The authorization gateway.
 *
 * Surfaces:
 *   POST /v1/authorize      — decide an intent: policy VM, then guard-wrapped simulation.
 *   POST /v1/execute        — authorize, and if ALLOW, broadcast through KeeperHub under
 *                             the caller's idempotency key. HOLD and DENY are returned as
 *                             verdicts; nothing is broadcast.
 *   POST /v1/holds          — authorize; a HOLD verdict creates a hold record and
 *                             notifies the configured channels.
 *   GET  /v1/holds          — the waiting queue.
 *   POST /v1/holds/:id/release — human approval: broadcast the held intent.
 *   POST /v1/holds/:id/cancel  — human rejection: resolve the hold without broadcasting.
 *   GET  /v1/executions/:id — poll a broadcast's status.
 *
 * Every decision — ALLOW, HOLD, or DENY — is persisted to the store before the response
 * is written. A denial is a result, not an error: it returns 200 with the receipt,
 * because the refusal is itself the evidence.
 */
export function buildApp(config: GatewayConfig, producer: EventProducer | null = null): Hono {
  const app = new Hono();
  const holds = new HoldLedger();

  const options = {
    client: config.client,
    policy: config.policy,
    policyHash: config.policyHash,
    guard: config.guard,
    guardAbi: config.guardAbi,
    now: () => new Date(),
  };

  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      policy: config.policy.name,
      guard: config.guard,
      chainIds: config.policy.chains,
      holdsWaiting: holds.list().filter((h) => h.status === "held").length,
      at: new Date().toISOString(),
    }),
  );

  /**
   * Readiness, which is a different question from liveness.
   *
   * /healthz says whether to restart the process. This says whether to route traffic to
   * it. An open breaker means the gateway cannot produce an ALLOW for anyone, so it
   * should not be receiving requests that expect one. Wiring the two together is how a
   * dependency blip becomes a restart loop.
   */
  app.get("/readyz", (c) => {
    const breakerClosed = config.breaker.current !== "open";
    const logReady = producer === null || producer.connected;

    dependencyUp.set(breakerClosed ? 1 : 0, { dependency: "keeperhub" });
    dependencyUp.set(logReady ? 1 : 0, { dependency: "event_log" });

    const ready = breakerClosed && logReady;
    return c.json(
      {
        ready,
        checks: {
          keeperhub: {
            ok: breakerClosed,
            breaker: config.breaker.current,
            retryAfterMs: config.breaker.retryAfterMs,
          },
          eventLog: { ok: logReady, enabled: producer !== null },
        },
      },
      ready ? 200 : 503,
    );
  });

  app.get("/metrics", (c) => {
    breakerState.set(config.breaker.code);
    return c.text(registry.render(), 200, { "content-type": Registry.CONTENT_TYPE });
  });

  app.post("/v1/authorize", async (c) => {
    const body = await parseBody<{ intent?: Intent }>(c);
    if (body === null) return c.json({ error: "request body must be JSON" }, 400);
    if (body.intent === undefined) return c.json({ error: "intent is required" }, 400);

    try {
      const result = await authorize(body.intent, contextFor(), options);
      const persisted = await persist(config, result.receipt, result.digest, producer);
      return c.json({ verdict: result.verdict, receipt: result.receipt, digest: result.digest, persisted });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  });

  app.post("/v1/execute", async (c) => {
    const body = await parseBody<{ intent?: Intent; idempotencyKey?: string }>(c);
    if (body === null) return c.json({ error: "request body must be JSON" }, 400);
    if (body.intent === undefined) return c.json({ error: "intent is required" }, 400);
    if (body.idempotencyKey === undefined || body.idempotencyKey === "") {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }

    try {
      const result = await authorize(body.intent, contextFor(), options);
      await persist(config, result.receipt, result.digest, producer);

      // HOLD and DENY are terminal here: the human gate owns HOLD, and a DENY must
      // never reach broadcast. The receipt is returned either way.
      if (result.verdict !== "ALLOW") {
        return c.json({
          status: result.verdict.toLowerCase(),
          receipt: result.receipt,
          digest: result.digest,
        });
      }

      const accepted = await config.client.executeContractCall(
        toGuardCall(body.intent, config.guard, config.guardAbi),
        body.idempotencyKey,
      );

      return c.json({
        status: "submitted",
        executionId: accepted.executionId,
        transactionHash: accepted.transactionHash,
        transactionLink: accepted.transactionLink,
        idempotentReplay: accepted.idempotentReplay,
        receipt: result.receipt,
        digest: result.digest,
      });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  });

  app.post("/v1/holds", async (c) => {
    const body = await parseBody<{ intent?: Intent; idempotencyKey?: string }>(c);
    if (body === null) return c.json({ error: "request body must be JSON" }, 400);
    if (body.intent === undefined) return c.json({ error: "intent is required" }, 400);
    if (body.idempotencyKey === undefined || body.idempotencyKey === "") {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }

    try {
      const result = await authorize(body.intent, contextFor(), options);
      await persist(config, result.receipt, result.digest, producer);

      // Not a HOLD verdict? Surface it as-is; the caller decides the next step.
      if (result.verdict !== "HOLD") {
        return c.json({
          status: result.verdict.toLowerCase(),
          receipt: result.receipt,
          digest: result.digest,
        });
      }

      const record = holds.create(body.intent, body.idempotencyKey, result.receipt, result.digest);
      const notified = await notifyHold(
        {
          holdId: record.holdId,
          intentId: record.intent.id,
          status: "held",
          digest: record.digest,
          reasons: record.receipt.reasons,
          at: record.at,
        },
        config.targets,
      );

      return c.json({
        status: "held",
        holdId: record.holdId,
        notified,
        receipt: result.receipt,
        digest: result.digest,
      });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  });

  app.get("/v1/holds", (c) =>
    c.json({ holds: holds.list().map((h) => ({ holdId: h.holdId, intentId: h.intent.id, status: h.status, digest: h.digest, at: h.at, resolvedAt: h.resolvedAt })) }),
  );

  app.post("/v1/holds/:id/release", async (c) => {
    const record = holds.resolve(c.req.param("id"), "released");
    if (record === null) return c.json({ error: "hold not found or already resolved" }, 404);

    try {
      const accepted = await config.client.executeContractCall(
        toGuardCall(record.intent, config.guard, config.guardAbi),
        record.idempotencyKey,
      );
      await notifyHold(
        {
          holdId: record.holdId,
          intentId: record.intent.id,
          status: "released",
          digest: record.digest,
          reasons: record.receipt.reasons,
          at: record.resolvedAt ?? record.at,
        },
        config.targets,
      );
      return c.json({
        status: "released",
        holdId: record.holdId,
        executionId: accepted.executionId,
        transactionHash: accepted.transactionHash,
        transactionLink: accepted.transactionLink,
      });
    } catch (error) {
      return c.json({ error: `release failed: ${(error as Error).message}` }, 400);
    }
  });

  app.post("/v1/holds/:id/cancel", async (c) => {
    const record = holds.resolve(c.req.param("id"), "cancelled");
    if (record === null) return c.json({ error: "hold not found or already resolved" }, 404);

    await notifyHold(
      {
        holdId: record.holdId,
        intentId: record.intent.id,
        status: "cancelled",
        digest: record.digest,
        reasons: record.receipt.reasons,
        at: record.resolvedAt ?? record.at,
      },
      config.targets,
    );
    return c.json({ status: "cancelled", holdId: record.holdId });
  });

  app.get("/v1/executions/:id", async (c) => {
    try {
      const status = await config.client.getExecutionStatus(c.req.param("id"));
      return c.json(status);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  });

  app.post("/v1/verify", async (c) => {
    const body = await parseBody<{ receipt?: unknown; claimedDigest?: string }>(c);
    if (body === null) return c.json({ error: "request body must be JSON" }, 400);
    if (body.receipt === undefined) return c.json({ error: "receipt is required" }, 400);

    try {
      const digest = receiptDigest(body.receipt as never);
      const claimed = body.claimedDigest?.trim() ?? "";
      return c.json({
        digest,
        matches: claimed === "" ? null : claimed.toLowerCase() === digest.toLowerCase(),
      });
    } catch (error) {
      return c.json({ error: `receipt is not verifiable: ${(error as Error).message}` }, 400);
    }
  });

  return app;
}

/**
 * Persist a decision. A store failure is reported, not thrown: the verdict is still
 * valid and the caller must still receive it, but the response says the evidence did
 * not land, so nobody mistakes a lost receipt for a stored one.
 *
 * The event log is written from here too, because this is the one point every verdict
 * passes through, whichever route produced it. Publishing is best-effort for the same
 * reason the store write is: a broker outage must not stop an agent being told no.
 */
async function persist(
  config: GatewayConfig,
  receipt: Receipt,
  digest: string,
  producer: EventProducer | null = null,
): Promise<boolean> {
  authorizations.inc({
    verdict: receipt.verdict,
    simulated: String(receipt.simulation !== null),
  });
  breakerState.set(config.breaker.code);

  let stored: boolean;
  try {
    await config.store.put({ ...receipt, digest });
    stored = true;
  } catch {
    stored = false;
  }

  await publish(producer, config, receipt, digest);
  return stored;
}

async function publish(
  producer: EventProducer | null,
  config: GatewayConfig,
  receipt: Receipt,
  digest: string,
): Promise<void> {
  if (producer === null) return;

  const traceparent = currentTraceparent();
  const event: DecisionEvent = {
    v: EVENT_VERSION,
    type: "decision",
    intentId: receipt.intentId,
    chainId: receipt.chainId,
    verdict: receipt.verdict,
    digest: digest as `0x${string}`,
    policyHash: config.policyHash,
    guard: config.guard,
    reasons: receipt.reasons.map((r) => ({
      code: r.code,
      severity: r.severity,
      message: r.message,
    })),
    simulated:
      receipt.simulation === null
        ? null
        : {
            wouldRevert: receipt.simulation.wouldRevert,
            gasEstimate: receipt.simulation.gasEstimate,
            ...(receipt.simulation.invariantIndex === undefined
              ? {}
              : { invariantIndex: receipt.simulation.invariantIndex }),
          },
    ...(traceparent === undefined ? {} : { traceparent }),
    at: receipt.at,
  };

  try {
    await producer.emitDecision(event);
    eventsPublished.inc({ topic: TOPICS.DECISIONS, outcome: "ok" });
  } catch {
    eventsPublished.inc({ topic: TOPICS.DECISIONS, outcome: "error" });
  }
}

/**
 * The gateway has no counterparty memory, so nothing is pre-known. The fresh-recipient
 * heuristic therefore holds on a first interaction until the operator records evidence
 * of prior contact — the conservative default for a system whose job is saying no.
 */
function contextFor(): EvalContext {
  return { now: new Date(), history: [], knownCounterparties: [] };
}

async function parseBody<T>(c: { req: { json(): Promise<unknown> } }): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}
