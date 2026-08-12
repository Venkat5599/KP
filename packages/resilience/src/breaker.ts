/**
 * A circuit breaker that fails CLOSED.
 *
 * This inverts the usual pattern, so the reasoning is written down rather than left to be
 * rediscovered.
 *
 * A conventional breaker exists to protect availability: when a dependency is sick, stop
 * calling it, and serve a degraded-but-permissive fallback so the product keeps working.
 * That trade is wrong here. The dependency noyeet protects is the simulator, and the
 * simulator is what tells us whether a transaction would break an invariant. If it cannot be
 * reached, the post-state is unknown, and an unknown post-state is precisely the thing this
 * system exists to refuse. So the fallback is DENY, not ALLOW. The breaker sheds load AND
 * preserves the safety property; those are the same action here, not competing ones.
 *
 * What counts as a failure is equally load-bearing. Only TRANSPORT faults trip it: timeouts,
 * socket death, 5xx, rate limiting. A simulated revert is a successful prediction — the
 * system worked exactly as designed — and must never trip the breaker. Conflating the two
 * would hand an attacker a denial-of-service: submit unsafe intents until the breaker opens.
 *
 * The clock is injected. A breaker with an ambient `Date.now()` cannot be tested for its
 * cooldown transition without a real sleep, and a test that sleeps is a test that gets
 * deleted.
 */

export type BreakerState = "closed" | "open" | "half-open";

/** Numeric encoding for a Prometheus gauge. Order is by severity, not alphabetical. */
export const STATE_CODE: Readonly<Record<BreakerState, number>> = {
  closed: 0,
  "half-open": 1,
  open: 2,
};

export interface BreakerOptions {
  /** Consecutive transport failures that open the circuit. */
  readonly failureThreshold?: number;
  /** How long the circuit stays open before a probe is allowed through. */
  readonly cooldownMs?: number;
  /** Consecutive successes in half-open required to close. */
  readonly successThreshold?: number;
  /** Injected so cooldown is testable without sleeping. */
  readonly now?: () => number;
  readonly onStateChange?: (from: BreakerState, to: BreakerState) => void;
}

export class CircuitOpenError extends Error {
  readonly kind = "circuit_open" as const;
  constructor(readonly retryAfterMs: number) {
    super(
      `Circuit is open; the simulator is unreachable so no intent can be authorized. Retry in ${retryAfterMs}ms.`,
    );
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private successes = 0;
  private openedAt = 0;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly successThreshold: number;
  private readonly now: () => number;
  private readonly onStateChange: ((from: BreakerState, to: BreakerState) => void) | undefined;

  constructor(options: BreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;
  }

  /** Current state, after applying any cooldown that has elapsed. */
  get current(): BreakerState {
    this.maybeHalfOpen();
    return this.state;
  }

  get code(): number {
    return STATE_CODE[this.current];
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  /** Milliseconds until a probe would be admitted. Zero when the circuit is not open. */
  get retryAfterMs(): number {
    if (this.current !== "open") return 0;
    return Math.max(0, this.openedAt + this.cooldownMs - this.now());
  }

  private transition(to: BreakerState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    if (to === "open") this.openedAt = this.now();
    if (to !== "half-open") this.successes = 0;
    if (to === "closed") this.failures = 0;
    this.onStateChange?.(from, to);
  }

  private maybeHalfOpen(): void {
    if (this.state !== "open") return;
    if (this.now() - this.openedAt >= this.cooldownMs) this.transition("half-open");
  }

  /** True when a call may proceed. Admits exactly the probe traffic half-open allows. */
  allows(): boolean {
    return this.current !== "open";
  }

  /** Throw rather than return, so a caller cannot forget to check. */
  assertAllowed(): void {
    if (!this.allows()) throw new CircuitOpenError(this.retryAfterMs);
  }

  recordSuccess(): void {
    this.maybeHalfOpen();
    if (this.state === "half-open") {
      this.successes += 1;
      if (this.successes >= this.successThreshold) this.transition("closed");
      return;
    }
    this.failures = 0;
  }

  /** Call ONLY for transport faults. A simulated revert is not a failure of the simulator. */
  recordFailure(): void {
    this.maybeHalfOpen();
    // A single failure while probing means the dependency is still sick. Going straight back
    // to open — rather than counting up to the threshold again — stops a half-open state from
    // leaking the full failure budget of traffic into a service that is still down.
    if (this.state === "half-open") {
      this.failures += 1;
      this.transition("open");
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.transition("open");
  }

  /**
   * Run `task` under the breaker. `isTransportFailure` decides what counts; the default
   * treats every throw as transport, which is correct only when the caller has already
   * separated expected outcomes from faults.
   */
  async execute<T>(
    task: () => Promise<T>,
    isTransportFailure: (error: unknown) => boolean = () => true,
  ): Promise<T> {
    this.assertAllowed();
    try {
      const result = await task();
      this.recordSuccess();
      return result;
    } catch (error) {
      if (isTransportFailure(error)) this.recordFailure();
      else this.recordSuccess();
      throw error;
    }
  }

  /** Force back to closed. For an operator action, never for automatic recovery. */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transition("closed");
  }
}
