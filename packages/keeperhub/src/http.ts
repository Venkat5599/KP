/**
 * HTTP layer for the KeeperHub adapter.
 *
 * The production transport is `fetch`. The `Transport` seam exists so tests can drive exact
 * failure sequences (429 with Retry-After, cold-start 503, mid-flight socket death) that a
 * live service will not produce on demand. Nothing here fakes a KeeperHub response in
 * production; the default transport is the real one.
 */

export interface HttpRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

/** The real transport. */
export const fetchTransport: Transport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return { status: response.status, headers, body: await response.text() };
};

// ------------------------------------------------------------------ errors

export type ErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "cold_start"
  | "upstream"
  | "network"
  | "timeout"
  | "unknown";

export interface KeeperHubErrorOptions {
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly body?: string;
  readonly cause?: unknown;
}

export class KeeperHubError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly options: KeeperHubErrorOptions = {},
  ) {
    super(message);
    this.name = "KeeperHubError";
  }

  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }

  get requestId(): string | undefined {
    return this.options.requestId;
  }
}

/** `Retry-After` is either delta-seconds or an HTTP date. Both are accepted. */
export function parseRetryAfter(value: string | undefined, now: number): number | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const at = Date.parse(trimmed);
  if (!Number.isNaN(at)) return Math.max(0, at - now);

  return undefined;
}

interface ErrorEnvelope {
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

function parseEnvelope(body: string): ErrorEnvelope {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null ? (parsed as ErrorEnvelope) : {};
  } catch {
    return {};
  }
}

/**
 * Map a non-2xx response onto the error taxonomy.
 *
 * Cold starts are the subtle case: KeeperHub returns 502/503/504 with
 * `code: upstream_cold_start` and a `retryAfterSeconds` hint. They are retryable, but only
 * when replayed under the same idempotency key, which the client enforces.
 */
export function toError(response: HttpResponse, now: number): KeeperHubError {
  const envelope = parseEnvelope(response.body);
  const message = envelope.error ?? envelope.message ?? `HTTP ${response.status}`;

  const shared: KeeperHubErrorOptions = {
    ...(envelope.code === undefined ? {} : { code: envelope.code }),
    ...(envelope.requestId === undefined ? {} : { requestId: envelope.requestId }),
    body: response.body.slice(0, 2048),
  };

  const headerDelay = parseRetryAfter(response.headers["retry-after"], now);
  const envelopeDelay =
    envelope.retryAfterSeconds === undefined ? undefined : envelope.retryAfterSeconds * 1000;
  const retryAfterMs = headerDelay ?? envelopeDelay;
  const withDelay: KeeperHubErrorOptions =
    retryAfterMs === undefined ? shared : { ...shared, retryAfterMs };

  if (response.status === 401) return new KeeperHubError(message, "unauthorized", 401, false, shared);
  if (response.status === 403) return new KeeperHubError(message, "forbidden", 403, false, shared);
  if (response.status === 404) return new KeeperHubError(message, "not_found", 404, false, shared);
  if (response.status === 413) {
    return new KeeperHubError(message, "payload_too_large", 413, false, shared);
  }
  if (response.status === 429) {
    return new KeeperHubError(message, "rate_limited", 429, true, withDelay);
  }
  if (response.status >= 500) {
    const coldStart = envelope.code === "upstream_cold_start";
    return new KeeperHubError(
      message,
      coldStart ? "cold_start" : "upstream",
      response.status,
      true,
      withDelay,
    );
  }
  if (response.status >= 400) {
    return new KeeperHubError(message, "invalid_request", response.status, false, shared);
  }

  return new KeeperHubError(message, "unknown", response.status, false, shared);
}

// ------------------------------------------------------------------- retry

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 20_000,
};

/**
 * Exponential backoff with full jitter.
 *
 * Full jitter rather than plain exponential: when several workers retry after the same
 * upstream blip, correlated retries reproduce the outage they were meant to survive. A
 * server-supplied delay always wins, because it reflects real capacity instead of a guess.
 */
export function backoffMs(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
  serverDelayMs?: number,
): number {
  if (serverDelayMs !== undefined) return Math.min(serverDelayMs, policy.maxDelayMs);
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
