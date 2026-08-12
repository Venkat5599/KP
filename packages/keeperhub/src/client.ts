import {
  backoffMs,
  DEFAULT_RETRY,
  fetchTransport,
  KeeperHubError,
  systemClock,
  toError,
  type Clock,
  type HttpResponse,
  type RetryPolicy,
  type Transport,
} from "./http.ts";
import { parseGuardDenial, type GuardDenial } from "./reason.ts";

export type Hex = `0x${string}`;

/**
 * The breaker surface this client needs, declared structurally.
 *
 * Typed as a shape rather than imported from `@noyeet/resilience` so the adapter keeps no
 * dependency on the reliability package: a caller that wants no breaker passes nothing, and
 * a caller with a different implementation is not forced to adopt ours.
 */
export interface BreakerLike {
  assertAllowed(): void;
  recordSuccess(): void;
  recordFailure(): void;
}

export interface ClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly transport?: Transport;
  readonly clock?: Clock;
  readonly random?: () => number;
  readonly retry?: RetryPolicy;
  readonly timeoutMs?: number;
  /**
   * Optional circuit breaker. Only transport faults feed it — a simulated revert is a
   * correct prediction from a healthy service, and counting it would let an attacker open
   * the circuit by submitting unsafe intents.
   */
  readonly breaker?: BreakerLike;
}

/**
 * Does this error mean the upstream is unwell, as opposed to the request being wrong?
 *
 * A 4xx other than 429 is the caller's fault and says nothing about KeeperHub's health, so
 * it must not count toward opening the circuit. The network, timeout, rate-limit, cold-start
 * and upstream kinds all do.
 */
function isTransportFault(error: unknown): boolean {
  if (!(error instanceof KeeperHubError)) return false;
  return (
    error.kind === "network" ||
    error.kind === "timeout" ||
    error.kind === "rate_limited" ||
    error.kind === "cold_start" ||
    error.kind === "upstream"
  );
}

// ------------------------------------------------------------------ requests

export interface TransferRequest {
  readonly chainId: number;
  readonly recipientAddress: Hex;
  /** Human-readable units, per the API contract. Not wei. */
  readonly amount: string;
  readonly tokenAddress?: Hex;
  readonly gasLimitMultiplier?: number;
}

export interface ContractCallRequest {
  readonly chainId: number;
  readonly contractAddress: Hex;
  readonly functionName: string;
  /** JSON-encoded array, per the API contract. */
  readonly functionArgs?: string;
  readonly abi?: string;
  /** Decimal string in ether units. */
  readonly value?: string;
  readonly gasLimitMultiplier?: number;
}

// ----------------------------------------------------------------- responses

/**
 * The outcome of `simulate: true`.
 *
 * A predicted revert is a *verdict*, not a transport failure, so it is returned rather than
 * thrown. KeeperHub signals it with HTTP 400, which would otherwise be indistinguishable
 * from a malformed request; `wouldRevert` is what separates them.
 */
export interface SimulationOutcome {
  readonly wouldRevert: boolean;
  /**
   * `validation` means KeeperHub rejected the call before the EVM ran it — an unfunded
   * wallet or a breached spending cap. No invariant was evaluated. Any other value means
   * the transaction executed and reverted.
   */
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly code: string | null;
  /** Structured denial, present only when the guard authored the revert. */
  readonly denial: GuardDenial | null;
  readonly raw: unknown;
}

export interface ExecutionAccepted {
  readonly executionId: string;
  readonly status: string;
  readonly transactionHash: Hex | null;
  readonly transactionLink: string | null;
  /** True when this response replayed a prior request under the same idempotency key. */
  readonly idempotentReplay: boolean;
  readonly raw: unknown;
}

export interface ExecutionReceipt {
  readonly hash: Hex;
  readonly verified: boolean;
  readonly receiptStatus: string;
  readonly blockNumber: number;
  readonly gasUsed: string;
}

export interface ExecutionStatus {
  readonly executionId: string;
  readonly status: string;
  readonly type: string | null;
  readonly transactionHash: Hex | null;
  readonly receipts: readonly ExecutionReceipt[];
  readonly error: string | null;
  readonly raw: unknown;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "reverted"]);

// ------------------------------------------------------------------- helpers

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function toSimulation(raw: unknown): SimulationOutcome {
  const record = asRecord(raw);
  const revertReason = str(record["revertReason"]) ?? str(record["error"]);
  return {
    wouldRevert: record["wouldRevert"] === true,
    failureKind: str(record["failureKind"]),
    revertReason,
    code: str(record["code"]),
    denial: parseGuardDenial(revertReason),
    raw,
  };
}

function toAccepted(raw: unknown): ExecutionAccepted {
  const record = asRecord(raw);
  return {
    executionId: str(record["executionId"]) ?? "",
    status: str(record["status"]) ?? "unknown",
    transactionHash: str(record["transactionHash"]) as Hex | null,
    transactionLink: str(record["transactionLink"]),
    idempotentReplay: record["idempotentReplay"] === true,
    raw,
  };
}

function toStatus(raw: unknown): ExecutionStatus {
  const record = asRecord(raw);
  const receipts: unknown[] = Array.isArray(record["receipts"]) ? record["receipts"] : [];

  return {
    executionId: str(record["executionId"]) ?? "",
    status: str(record["status"]) ?? "unknown",
    type: str(record["type"]),
    transactionHash: str(record["transactionHash"]) as Hex | null,
    receipts: receipts.map((entry) => {
      const item = asRecord(entry);
      return {
        hash: (str(item["hash"]) ?? "0x") as Hex,
        verified: item["verified"] === true,
        receiptStatus: str(item["receiptStatus"]) ?? "unknown",
        blockNumber: typeof item["blockNumber"] === "number" ? item["blockNumber"] : 0,
        gasUsed: str(item["gasUsed"]) ?? "0",
      };
    }),
    error: str(record["error"]),
    raw,
  };
}

/**
 * A 409 carries two meanings that demand opposite responses.
 *
 *   idempotency_in_progress — the original request is still running. Retry; the server
 *                             returns the same result rather than sending twice.
 *   idempotency_conflict    — the key was reused with a *different* body. Never retry;
 *                             retrying cannot succeed, and the mismatch is a caller bug.
 */
function isRetryableConflict(response: HttpResponse): boolean {
  return asRecord(parseJson(response.body))["code"] === "idempotency_in_progress";
}

export class KeeperHubClient {
  private readonly baseUrl: string;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly retry: RetryPolicy;
  private readonly timeoutMs: number;
  private readonly apiKey: string;
  private readonly breaker: BreakerLike | null;

  /** One in-flight send per wallet, so concurrent intents cannot race the nonce. */
  private readonly walletQueues = new Map<string, Promise<unknown>>();

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error("KeeperHubClient requires an apiKey");
    this.breaker = options.breaker ?? null;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.keeperhub.com").replace(/\/+$/, "");
    this.transport = options.transport ?? fetchTransport;
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? Math.random;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  // --------------------------------------------------------------- transport

  /**
   * Breaker-guarded entry point.
   *
   * The check is outside the retry loop on purpose. Retrying inside an open circuit is the
   * exact behaviour the breaker exists to stop, and re-checking per attempt would let a
   * circuit that opened mid-sequence abandon a request that was already in flight upstream.
   *
   * Note what counts as success: a simulated revert reaches here as a normal 400 response
   * returned by `sendWithRetries`, so it records a success. That is correct — the simulator
   * answered, and the answer was DENY.
   */
  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<HttpResponse> {
    this.breaker?.assertAllowed();

    try {
      const response = await this.sendWithRetries(method, path, body, idempotencyKey);
      this.breaker?.recordSuccess();
      return response;
    } catch (error) {
      if (isTransportFault(error)) this.breaker?.recordFailure();
      else this.breaker?.recordSuccess();
      throw error;
    }
  }

  private async sendWithRetries(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey !== undefined) headers["idempotency-key"] = idempotencyKey;

    let lastError: KeeperHubError | null = null;

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      let response: HttpResponse;

      try {
        response = await this.transport({
          method,
          url: `${this.baseUrl}${path}`,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        // A socket death after the request left the machine may or may not have been
        // applied server-side. Retrying is safe only because the idempotency key makes a
        // duplicate send a no-op.
        const timedOut = cause instanceof Error && cause.name === "TimeoutError";
        lastError = new KeeperHubError(
          cause instanceof Error ? cause.message : "network failure",
          timedOut ? "timeout" : "network",
          null,
          true,
          { cause },
        );
        if (attempt === this.retry.maxAttempts) throw lastError;
        await this.clock.sleep(backoffMs(attempt, this.retry, this.random));
        continue;
      }

      if (response.status < 400) return response;

      if (response.status === 409) {
        const conflict = toError(response, this.clock.now());
        if (!isRetryableConflict(response)) throw conflict;
        lastError = conflict;
        if (attempt === this.retry.maxAttempts) throw conflict;
        await this.clock.sleep(backoffMs(attempt, this.retry, this.random));
        continue;
      }

      // A simulated revert arrives as HTTP 400 and is a result, not an error.
      if (response.status === 400 && asRecord(parseJson(response.body))["wouldRevert"] === true) {
        return response;
      }

      const error = toError(response, this.clock.now());
      if (!error.retryable || attempt === this.retry.maxAttempts) throw error;

      lastError = error;
      await this.clock.sleep(backoffMs(attempt, this.retry, this.random, error.retryAfterMs));
    }

    throw lastError ?? new KeeperHubError("retries exhausted", "unknown", null, false);
  }

  private async post(path: string, body: unknown, idempotencyKey?: string): Promise<unknown> {
    const response = await this.request("POST", path, body, idempotencyKey);
    return parseJson(response.body);
  }

  /** Serialize sends per wallet. Concurrent callers queue instead of colliding. */
  private enqueue<T>(walletKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.walletQueues.get(walletKey) ?? Promise.resolve();
    // `then(task, task)` runs the next send whether the previous one settled or failed, so a
    // single failure cannot wedge the wallet's queue permanently.
    const next = previous.then(task, task);
    // The stored link swallows rejection; the caller still receives the real promise, so an
    // error surfaces exactly once instead of becoming an unhandled rejection here.
    this.walletQueues.set(
      walletKey,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  // -------------------------------------------------------------- simulation

  async simulateTransfer(request: TransferRequest): Promise<SimulationOutcome> {
    return toSimulation(await this.post("/api/execute/transfer", { ...request, simulate: true }));
  }

  async simulateContractCall(request: ContractCallRequest): Promise<SimulationOutcome> {
    return toSimulation(
      await this.post("/api/execute/contract-call", { ...request, simulate: true }),
    );
  }

  // --------------------------------------------------------------- execution

  async executeTransfer(
    request: TransferRequest,
    idempotencyKey: string,
  ): Promise<ExecutionAccepted> {
    return this.enqueue(`${request.chainId}:transfer`, async () =>
      toAccepted(await this.post("/api/execute/transfer", request, idempotencyKey)),
    );
  }

  async executeContractCall(
    request: ContractCallRequest,
    idempotencyKey: string,
  ): Promise<ExecutionAccepted> {
    return this.enqueue(`${request.chainId}:${request.contractAddress.toLowerCase()}`, async () =>
      toAccepted(await this.post("/api/execute/contract-call", request, idempotencyKey)),
    );
  }

  async getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
    const response = await this.request(
      "GET",
      `/api/execute/${encodeURIComponent(executionId)}/status`,
    );
    return toStatus(parseJson(response.body));
  }

  /** Poll until the execution reaches a terminal state or the budget expires. */
  async waitForExecution(
    executionId: string,
    options: { readonly timeoutMs?: number; readonly intervalMs?: number } = {},
  ): Promise<ExecutionStatus> {
    const timeoutMs = options.timeoutMs ?? 180_000;
    const intervalMs = options.intervalMs ?? 2_000;
    const deadline = this.clock.now() + timeoutMs;

    for (;;) {
      const status = await this.getExecutionStatus(executionId);
      if (TERMINAL_STATUSES.has(status.status)) return status;

      if (this.clock.now() >= deadline) {
        throw new KeeperHubError(
          `Execution ${executionId} did not settle within ${timeoutMs}ms (last status: ${status.status})`,
          "timeout",
          null,
          false,
        );
      }
      await this.clock.sleep(intervalMs);
    }
  }

  async getUser(): Promise<unknown> {
    return parseJson((await this.request("GET", "/api/user")).body);
  }
}
