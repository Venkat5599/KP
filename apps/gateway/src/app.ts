import { Hono } from "hono";
import type { EvalContext, Intent } from "@noyeet/policy";
import { authorize, toGuardCall } from "./authorize.ts";
import type { GatewayConfig } from "./config.ts";

/**
 * The authorization gateway.
 *
 * Three surfaces:
 *   POST /v1/authorize      — decide an intent: policy VM, then guard-wrapped simulation.
 *   POST /v1/execute        — authorize, and if ALLOW, broadcast through KeeperHub under
 *                             the caller's idempotency key. HOLD and DENY are returned as
 *                             verdicts; nothing is broadcast.
 *   GET  /v1/executions/:id — poll a broadcast's status.
 *
 * A denial is a result, not an error: it returns 200 with the receipt, because the
 * refusal is itself the evidence.
 */
export function buildApp(config: GatewayConfig): Hono {
  const app = new Hono();

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
      at: new Date().toISOString(),
    }),
  );

  app.post("/v1/authorize", async (c) => {
    const body = await parseBody<{ intent?: Intent }>(c);
    if (body === null) return c.json({ error: "request body must be JSON" }, 400);
    if (body.intent === undefined) return c.json({ error: "intent is required" }, 400);

    try {
      const result = await authorize(body.intent, contextFor(), options);
      return c.json({ verdict: result.verdict, receipt: result.receipt, digest: result.digest });
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

  app.get("/v1/executions/:id", async (c) => {
    try {
      const status = await config.client.getExecutionStatus(c.req.param("id"));
      return c.json(status);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  });

  return app;
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
