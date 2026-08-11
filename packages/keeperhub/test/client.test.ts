import { describe, expect, test } from "bun:test";
import {
  backoffMs,
  DEFAULT_RETRY,
  KeeperHubClient,
  KeeperHubError,
  parseGuardDenial,
  parseRetryAfter,
  type Clock,
  type Hex,
  type HttpRequest,
  type HttpResponse,
} from "../src/index.ts";

/**
 * A scripted transport. This is a test seam, not a mock of business logic: it replays exact
 * HTTP responses so failure modes a live service will not produce on demand (429 with
 * Retry-After, cold-start 503, socket death mid-flight) can be asserted deterministically.
 *
 * Every response shape below was copied from a real KeeperHub reply captured against the
 * live API, not invented.
 */
function scripted(script: readonly (HttpResponse | Error)[]) {
  const seen: HttpRequest[] = [];
  let index = 0;

  const transport = async (request: HttpRequest): Promise<HttpResponse> => {
    seen.push(request);
    const next = script[Math.min(index, script.length - 1)];
    index++;
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("script exhausted");
    return next;
  };

  return { transport, seen, attempts: () => index };
}

function ok(body: unknown, status = 200): HttpResponse {
  return { status, headers: {}, body: JSON.stringify(body) };
}

function fail(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers, body: JSON.stringify(body) };
}

/** Records sleeps instead of performing them, so the suite stays fast and deterministic. */
function fakeClock(): Clock & { readonly sleeps: number[] } {
  const sleeps: number[] = [];
  let current = 1_000_000;
  return {
    sleeps,
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += ms;
    },
  };
}

const GUARD = "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as Hex;

const CALL = {
  chainId: 11155111,
  contractAddress: GUARD,
  functionName: "executeGuarded",
};

function makeClient(script: readonly (HttpResponse | Error)[], overrides: object = {}) {
  const s = scripted(script);
  const clock = fakeClock();
  const client = new KeeperHubClient({
    apiKey: "kh_test",
    transport: s.transport,
    clock,
    random: () => 0.5,
    ...overrides,
  });
  return { client, clock, ...s };
}

describe("simulation is a verdict, not an error", () => {
  test("a guard revert returns a parsed denial instead of throwing", async () => {
    const { client } = makeClient([
      fail(400, {
        success: false,
        status: "simulated",
        wouldRevert: true,
        failureKind: "revert",
        revertReason: "Error(NOYEET/1:INV:0:1120000000000000000:1400000000000000000)",
      }),
    ]);

    const outcome = await client.simulateContractCall(CALL);

    expect(outcome.wouldRevert).toBe(true);
    expect(outcome.failureKind).toBe("revert");
    expect(outcome.denial).toEqual({
      kind: "invariant",
      index: 0,
      got: 1_120_000_000_000_000_000n,
      want: 1_400_000_000_000_000_000n,
    });
  });

  /**
   * The distinction that matters most. An unfunded wallet is not a broken invariant;
   * reporting it as one tells an operator their position is unsafe when the real problem is
   * an empty gas tank.
   */
  test("a validation failure is not reported as an invariant breach", async () => {
    const { client } = makeClient([
      fail(400, {
        success: false,
        status: "simulated",
        wouldRevert: true,
        failureKind: "validation",
        code: "insufficient_balance",
        revertReason: "Insufficient BASE balance. Have: 0.0, Need: 0.0001.",
      }),
    ]);

    const outcome = await client.simulateContractCall(CALL);

    expect(outcome.failureKind).toBe("validation");
    expect(outcome.code).toBe("insufficient_balance");
    expect(outcome.denial).toBeNull();
  });

  test("a passing simulation reports no revert", async () => {
    const { client } = makeClient([
      ok({ success: true, status: "simulated", wouldRevert: false, gasEstimate: "52667" }),
    ]);
    const outcome = await client.simulateContractCall(CALL);
    expect(outcome.wouldRevert).toBe(false);
    expect(outcome.denial).toBeNull();
  });

  test("a genuine 400 still throws", async () => {
    const { client } = makeClient([fail(400, { error: "chainId is required" })]);
    await expect(client.simulateContractCall(CALL)).rejects.toThrow(KeeperHubError);
  });
});

describe("idempotency", () => {
  test("the key is sent and preserved across retries", async () => {
    const { client, seen } = makeClient([
      fail(503, { code: "upstream_cold_start", retryAfterSeconds: 2 }),
      ok({ executionId: "direct_1", status: "completed" }),
    ]);

    await client.executeContractCall(CALL, "intent-abc");

    expect(seen).toHaveLength(2);
    expect(seen[0]?.headers["idempotency-key"]).toBe("intent-abc");
    expect(seen[1]?.headers["idempotency-key"]).toBe("intent-abc");
  });

  test("in-progress conflict is retried", async () => {
    const { client, attempts } = makeClient([
      fail(409, { code: "idempotency_in_progress", retryable: true }),
      ok({ executionId: "direct_2", status: "completed", idempotentReplay: true }),
    ]);

    const result = await client.executeContractCall(CALL, "intent-def");

    expect(attempts()).toBe(2);
    expect(result.idempotentReplay).toBe(true);
  });

  /** Same key, different body. Retrying cannot succeed; it is a caller bug. */
  test("key conflict is never retried", async () => {
    const { client, attempts } = makeClient([
      fail(409, { code: "idempotency_conflict", retryable: false }),
    ]);

    await expect(client.executeContractCall(CALL, "intent-ghi")).rejects.toThrow(KeeperHubError);
    expect(attempts()).toBe(1);
  });
});

describe("retry behaviour", () => {
  test("429 honours Retry-After over computed backoff", async () => {
    const { client, clock } = makeClient([
      fail(429, { error: "slow down" }, { "retry-after": "3" }),
      ok({ executionId: "direct_3", status: "completed" }),
    ]);

    await client.executeContractCall(CALL, "intent-jkl");
    expect(clock.sleeps).toEqual([3000]);
  });

  test("cold start honours retryAfterSeconds from the body", async () => {
    const { client, clock } = makeClient([
      fail(503, { code: "upstream_cold_start", retryAfterSeconds: 5 }),
      ok({ executionId: "direct_4", status: "completed" }),
    ]);

    await client.executeContractCall(CALL, "intent-mno");
    expect(clock.sleeps).toEqual([5000]);
  });

  test("network failure retries under the same key", async () => {
    const { client, seen } = makeClient([
      new Error("socket hang up"),
      ok({ executionId: "direct_5", status: "completed" }),
    ]);

    const result = await client.executeContractCall(CALL, "intent-pqr");

    expect(result.executionId).toBe("direct_5");
    expect(seen.every((r) => r.headers["idempotency-key"] === "intent-pqr")).toBe(true);
  });

  test("unauthorized is never retried", async () => {
    const { client, attempts } = makeClient([fail(401, { error: "Unauthorized" })]);
    await expect(client.getUser()).rejects.toThrow(KeeperHubError);
    expect(attempts()).toBe(1);
  });

  test("spending cap breach is a 403 and is never retried", async () => {
    const { client, attempts } = makeClient([
      fail(403, { error: "Daily spending cap exceeded." }),
    ]);
    await expect(client.executeContractCall(CALL, "intent-stu")).rejects.toThrow(KeeperHubError);
    expect(attempts()).toBe(1);
  });

  test("retries are bounded", async () => {
    const { client, attempts } = makeClient([fail(503, { error: "down" })], {
      retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 },
    });

    await expect(client.executeContractCall(CALL, "intent-vwx")).rejects.toThrow(KeeperHubError);
    expect(attempts()).toBe(3);
  });
});

describe("per-wallet serialization", () => {
  /** Concurrent sends to one target must not interleave, or they race the nonce. */
  test("sends to the same target run one at a time", async () => {
    const order: string[] = [];
    let inFlight = 0;
    let maxConcurrent = 0;

    const transport = async (request: HttpRequest): Promise<HttpResponse> => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      order.push(request.headers["idempotency-key"] ?? "?");
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return ok({ executionId: "direct_x", status: "completed" });
    };

    const client = new KeeperHubClient({ apiKey: "kh_test", transport });

    await Promise.all([
      client.executeContractCall(CALL, "first"),
      client.executeContractCall(CALL, "second"),
      client.executeContractCall(CALL, "third"),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(order).toEqual(["first", "second", "third"]);
  });

  test("a failed send does not wedge the queue", async () => {
    let call = 0;
    const transport = async (): Promise<HttpResponse> => {
      call++;
      if (call === 1) return fail(401, { error: "Unauthorized" });
      return ok({ executionId: "direct_y", status: "completed" });
    };

    const client = new KeeperHubClient({ apiKey: "kh_test", transport });

    await expect(client.executeContractCall(CALL, "doomed")).rejects.toThrow(KeeperHubError);
    const recovered = await client.executeContractCall(CALL, "recovered");
    expect(recovered.executionId).toBe("direct_y");
  });
});

describe("waitForExecution", () => {
  test("polls until a terminal status", async () => {
    const { client } = makeClient([
      ok({ executionId: "direct_6", status: "pending" }),
      ok({ executionId: "direct_6", status: "pending" }),
      ok({
        executionId: "direct_6",
        status: "completed",
        transactionHash: "0xabc",
        receipts: [
          {
            hash: "0xabc",
            verified: true,
            receiptStatus: "success",
            blockNumber: 123,
            gasUsed: "68115",
          },
        ],
      }),
    ]);

    const status = await client.waitForExecution("direct_6", { intervalMs: 1 });

    expect(status.status).toBe("completed");
    expect(status.receipts[0]?.gasUsed).toBe("68115");
    expect(status.receipts[0]?.blockNumber).toBe(123);
  });

  test("gives up at the deadline rather than polling forever", async () => {
    const { client } = makeClient([ok({ executionId: "direct_7", status: "pending" })]);
    await expect(client.waitForExecution("direct_7", { timeoutMs: 10, intervalMs: 5 })).rejects.toThrow(
      KeeperHubError,
    );
  });
});

describe("primitives", () => {
  test("Retry-After accepts seconds and HTTP dates", () => {
    const now = Date.parse("2026-08-11T14:00:00Z");
    expect(parseRetryAfter("3", now)).toBe(3000);
    expect(parseRetryAfter("Tue, 11 Aug 2026 14:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfter("garbage", now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });

  test("backoff is bounded and honours a server delay", () => {
    expect(backoffMs(1, DEFAULT_RETRY, () => 0.5)).toBe(125);
    expect(backoffMs(99, DEFAULT_RETRY, () => 1)).toBe(DEFAULT_RETRY.maxDelayMs);
    expect(backoffMs(1, DEFAULT_RETRY, () => 0.5, 7000)).toBe(7000);
  });

  test("reason parser tolerates wrapping and rejects foreign strings", () => {
    expect(parseGuardDenial("NOYEET/1:NOT_EXECUTOR")).toEqual({ kind: "not_executor" });
    expect(parseGuardDenial("Error(NOYEET/1:PROBE_FAILED:2)")).toEqual({
      kind: "probe_failed",
      index: 2,
    });
    expect(parseGuardDenial("NOYEET/1:PROBE_SHORT:0:32:128")).toEqual({
      kind: "probe_short",
      index: 0,
      length: 32,
      needed: 128,
    });
    expect(parseGuardDenial("ERC20: transfer amount exceeds balance")).toBeNull();
    expect(parseGuardDenial("NOYEET/1:INV:0:notanumber:5")).toBeNull();
    expect(parseGuardDenial(null)).toBeNull();
  });

  test("an apiKey is required", () => {
    expect(() => new KeeperHubClient({ apiKey: "" })).toThrow();
  });
});
