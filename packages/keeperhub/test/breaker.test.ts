import { describe, expect, test } from "bun:test";
import { KeeperHubClient } from "../src/client.ts";
import { CircuitBreaker, CircuitOpenError } from "../../resilience/src/breaker.ts";
import type { HttpResponse, Transport } from "../src/http.ts";

/**
 * Integration between the adapter and the breaker.
 *
 * The behaviour under test is the security-relevant half: which outcomes are allowed to open
 * the circuit. A simulated revert must not, or an attacker submitting unsafe intents could
 * take authorization offline for everyone.
 */

const NO_RETRY = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 };
const instantClock = { now: () => Date.now(), sleep: async () => {} };

function respond(status: number, body: unknown): HttpResponse {
  return { status, headers: {}, body: JSON.stringify(body) };
}

function clientWith(transport: Transport, breaker: CircuitBreaker) {
  return new KeeperHubClient({
    apiKey: "kh_test",
    transport,
    breaker,
    retry: NO_RETRY,
    clock: instantClock,
  });
}

const CALL = {
  chainId: 11155111,
  contractAddress: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",
  functionName: "executeGuarded",
} as const;

describe("KeeperHubClient with a circuit breaker", () => {
  test("a simulated revert does not open the circuit", async () => {
    // The DoS guard. A 400 carrying wouldRevert is the simulator working correctly.
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const client = clientWith(
      async () =>
        respond(400, {
          wouldRevert: true,
          failureKind: "revert",
          revertReason: "NOYEET/1:INV:0:1120000000000000000:1400000000000000000",
        }),
      breaker,
    );

    for (let i = 0; i < 5; i++) {
      const outcome = await client.simulateContractCall(CALL);
      expect(outcome.wouldRevert).toBe(true);
    }
    expect(breaker.current).toBe("closed");
  });

  test("a client error does not open the circuit", async () => {
    // 401 says the caller is wrong, not that KeeperHub is unwell.
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const client = clientWith(async () => respond(401, { error: "bad key" }), breaker);

    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    expect(breaker.current).toBe("closed");
  });

  test("repeated upstream 5xx opens the circuit", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const client = clientWith(async () => respond(503, { error: "unavailable" }), breaker);

    for (let i = 0; i < 3; i++) {
      await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    }
    expect(breaker.current).toBe("open");
  });

  test("network failures open the circuit", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const client = clientWith(async () => {
      throw new Error("ECONNREFUSED");
    }, breaker);

    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    expect(breaker.current).toBe("open");
  });

  test("an open circuit refuses without touching the transport", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    let calls = 0;
    const client = clientWith(async () => {
      calls += 1;
      throw new Error("ECONNREFUSED");
    }, breaker);

    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    expect(breaker.current).toBe("open");

    await expect(client.simulateContractCall(CALL)).rejects.toThrow(CircuitOpenError);
    expect(calls).toBe(1);
  });

  test("a success closes a half-open circuit and traffic resumes", async () => {
    let t = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 1_000,
      successThreshold: 1,
      now: () => t,
    });

    let healthy = false;
    const client = clientWith(async () => {
      if (!healthy) throw new Error("ECONNREFUSED");
      return respond(200, { wouldRevert: false, gasEstimate: "52667" });
    }, breaker);

    await expect(client.simulateContractCall(CALL)).rejects.toThrow();
    expect(breaker.current).toBe("open");

    t += 1_000;
    healthy = true;
    const outcome = await client.simulateContractCall(CALL);
    expect(outcome.wouldRevert).toBe(false);
    expect(breaker.current).toBe("closed");
  });

  test("a client without a breaker behaves exactly as before", async () => {
    const client = new KeeperHubClient({
      apiKey: "kh_test",
      transport: async () => respond(200, { wouldRevert: false, gasEstimate: "21000" }),
      retry: NO_RETRY,
      clock: instantClock,
    });
    const outcome = await client.simulateContractCall(CALL);
    expect(outcome.wouldRevert).toBe(false);
  });
});
