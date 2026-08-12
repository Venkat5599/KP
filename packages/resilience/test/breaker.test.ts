import { describe, expect, test } from "bun:test";
import { CircuitBreaker, CircuitOpenError, STATE_CODE } from "../src/breaker.ts";

/** A controllable clock, so cooldown is tested without a real sleep. */
function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("CircuitBreaker", () => {
  test("starts closed and allows traffic", () => {
    const breaker = new CircuitBreaker();
    expect(breaker.current).toBe("closed");
    expect(breaker.allows()).toBe(true);
    expect(breaker.code).toBe(STATE_CODE.closed);
  });

  test("opens after the configured consecutive-failure threshold", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.current).toBe("closed");
    breaker.recordFailure();
    expect(breaker.current).toBe("open");
    expect(breaker.allows()).toBe(false);
  });

  test("a success resets the failure run while closed", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.current).toBe("closed");
  });

  test("moves open to half-open only after the cooldown elapses", () => {
    const c = clock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 5_000, now: c.now });
    breaker.recordFailure();
    expect(breaker.current).toBe("open");

    c.advance(4_999);
    expect(breaker.current).toBe("open");

    c.advance(1);
    expect(breaker.current).toBe("half-open");
    expect(breaker.allows()).toBe(true);
  });

  test("a single failure while half-open returns straight to open", () => {
    const c = clock();
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1_000,
      now: c.now,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    c.advance(1_000);
    expect(breaker.current).toBe("half-open");

    breaker.recordFailure();
    expect(breaker.current).toBe("open");
  });

  test("closes after the configured successes while half-open", () => {
    const c = clock();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 1_000,
      successThreshold: 2,
      now: c.now,
    });
    breaker.recordFailure();
    c.advance(1_000);
    expect(breaker.current).toBe("half-open");

    breaker.recordSuccess();
    expect(breaker.current).toBe("half-open");
    breaker.recordSuccess();
    expect(breaker.current).toBe("closed");
  });

  test("reports retryAfterMs while open and zero otherwise", () => {
    const c = clock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10_000, now: c.now });
    expect(breaker.retryAfterMs).toBe(0);
    breaker.recordFailure();
    expect(breaker.retryAfterMs).toBe(10_000);
    c.advance(3_000);
    expect(breaker.retryAfterMs).toBe(7_000);
  });

  test("exposes state as a gauge-ready number", () => {
    const c = clock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, now: c.now });
    expect(breaker.code).toBe(0);
    breaker.recordFailure();
    expect(breaker.code).toBe(2);
    c.advance(100);
    expect(breaker.code).toBe(1);
  });

  test("assertAllowed throws CircuitOpenError carrying the retry hint", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 7_000 });
    breaker.recordFailure();
    expect(() => breaker.assertAllowed()).toThrow(CircuitOpenError);
    try {
      breaker.assertAllowed();
    } catch (error) {
      expect((error as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
      expect((error as CircuitOpenError).kind).toBe("circuit_open");
    }
  });

  test("emits a state-change callback exactly once per transition", () => {
    const c = clock();
    const seen: string[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 500,
      now: c.now,
      onStateChange: (from, to) => seen.push(`${from}->${to}`),
    });
    breaker.recordFailure();
    c.advance(500);
    void breaker.current;
    void breaker.current;
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(seen).toEqual(["closed->open", "open->half-open", "half-open->closed"]);
  });

  test("execute records a success and returns the value", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(async () => 42)).resolves.toBe(42);
    expect(breaker.current).toBe("closed");
  });

  test("execute refuses immediately once open, without calling the task", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure();

    let called = false;
    await expect(
      breaker.execute(async () => {
        called = true;
        return 1;
      }),
    ).rejects.toThrow(CircuitOpenError);
    expect(called).toBe(false);
  });

  test("a non-transport error rethrows without tripping the breaker", async () => {
    // This is the DoS guard: a simulated revert is a correct answer, not an outage.
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const isTransport = (error: unknown) => (error as Error).message !== "would revert";

    await expect(
      breaker.execute(async () => {
        throw new Error("would revert");
      }, isTransport),
    ).rejects.toThrow("would revert");

    expect(breaker.current).toBe("closed");
  });

  test("reset returns an open breaker to closed", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure();
    expect(breaker.current).toBe("open");
    breaker.reset();
    expect(breaker.current).toBe("closed");
    expect(breaker.consecutiveFailures).toBe(0);
  });
});
