import { EVENT_VERSION, type DecisionEvent, type Hex, type NoyeetEvent, type Verdict } from "./schema.ts";

/**
 * Hand-written validation rather than a schema library.
 *
 * The consumer runs this on every record on the hot path, and the surface is small and
 * closed. A schema registry plus Avro would buy compatibility checking that a single-writer,
 * single-reader topic does not need, at the cost of another container to keep alive.
 *
 * Validation is total: it returns either a typed value or an error naming the field. It
 * never throws, because a throw inside a message handler is the standard way a partition
 * wedges.
 */

export class EventValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(`${message} (field: ${field})`);
    this.name = "EventValidationError";
  }
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EventValidationError };

const ok = <T,>(value: T): Validated<T> => ({ ok: true, value });
const fail = <T,>(message: string, field: string): Validated<T> => ({
  ok: false,
  error: new EventValidationError(message, field),
});

const VERDICTS = new Set<string>(["ALLOW", "HOLD", "DENY"]);
const HEX = /^0x[0-9a-fA-F]*$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse bytes off the wire. Anything malformed becomes a typed failure, never a throw. */
export function decodeEvent(payload: Uint8Array | null): Validated<NoyeetEvent> {
  if (payload === null || payload.length === 0) return fail("Empty message payload", "$");

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (cause) {
    return fail(`Payload is not valid JSON: ${(cause as Error).message}`, "$");
  }

  const body = record(parsed);
  if (body === null) return fail("Event must be a JSON object", "$");

  if (body["v"] !== EVENT_VERSION) {
    return fail(
      `Unsupported event version ${String(body["v"])}; this build understands ${EVENT_VERSION}`,
      "v",
    );
  }

  switch (body["type"]) {
    case "decision":
      return validateDecision(body);
    case "anchor":
    case "dead-letter":
      // No downstream consumer in this build; version and type are the whole contract.
      return ok(body as unknown as NoyeetEvent);
    default:
      return fail(`Unknown event type ${String(body["type"])}`, "type");
  }
}

function validateDecision(body: Record<string, unknown>): Validated<NoyeetEvent> {
  const intentId = body["intentId"];
  if (typeof intentId !== "string" || intentId.length === 0) {
    return fail("intentId must be a non-empty string", "intentId");
  }

  const verdict = body["verdict"];
  if (typeof verdict !== "string" || !VERDICTS.has(verdict)) {
    return fail(`verdict must be one of ALLOW, HOLD, DENY; got ${String(verdict)}`, "verdict");
  }

  const digest = body["digest"];
  if (typeof digest !== "string" || !HEX.test(digest)) {
    return fail("digest must be 0x-prefixed hex", "digest");
  }
  // A Merkle leaf is exactly 32 bytes. A short digest would hash into the tree without
  // complaint and produce a root nobody can reproduce, so it is rejected at the boundary.
  if (digest.length !== 66) {
    return fail(`digest must be 32 bytes (66 chars incl. 0x); got ${digest.length}`, "digest");
  }

  const chainId = body["chainId"];
  if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) {
    return fail("chainId must be a positive integer", "chainId");
  }

  if (!Array.isArray(body["reasons"])) return fail("reasons must be an array", "reasons");

  const at = body["at"];
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) {
    return fail("at must be an ISO-8601 timestamp", "at");
  }

  return ok({
    ...(body as unknown as DecisionEvent),
    verdict: verdict as Verdict,
    digest: digest as Hex,
  });
}
