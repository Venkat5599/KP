/**
 * Event shapes.
 *
 * Every event carries `v`. A consumer that does not recognise `v` must refuse the record
 * rather than best-effort parse it: a receipt pipeline that silently drops a field it did
 * not understand produces a digest that will not match the one the producer computed, and
 * the mismatch surfaces months later at verification time with no way to reconstruct why.
 *
 * uint256-scale values travel as decimal strings, matching `@noyeet/receipts`. JSON numbers
 * are IEEE-754 doubles and would round a wei amount silently.
 */

export type Hex = `0x${string}`;
export type Verdict = "ALLOW" | "HOLD" | "DENY";

/** Current schema version. Bump only alongside a new topic. */
export const EVENT_VERSION = 1 as const;

export interface EventReason {
  readonly code: string;
  readonly severity: "hold" | "deny";
  readonly message: string;
}

/**
 * A decision, emitted for every verdict.
 *
 * `digest` is the receipt digest from `@noyeet/receipts` and is the Merkle leaf. It is the
 * only field the anchor service needs; everything else exists so an operator reading the
 * topic can understand a refusal without joining against another store.
 */
export interface DecisionEvent {
  readonly v: typeof EVENT_VERSION;
  readonly type: "decision";
  readonly intentId: string;
  readonly chainId: number;
  readonly verdict: Verdict;
  readonly digest: Hex;
  readonly policyHash: Hex;
  readonly guard: Hex;
  readonly reasons: readonly EventReason[];
  /** Present only when a simulation ran. A static DENY short-circuits before preflight. */
  readonly simulated: {
    readonly wouldRevert: boolean;
    readonly gasEstimate: string;
    readonly invariantIndex?: number;
  } | null;
  /** W3C traceparent, so a record on the topic links back to its span. */
  readonly traceparent?: string;
  readonly at: string;
}

/** A Merkle batch of decision digests, ready to anchor. */
export interface AnchorEvent {
  readonly v: typeof EVENT_VERSION;
  readonly type: "anchor";
  readonly root: Hex;
  readonly leaves: readonly Hex[];
  readonly at: string;
}

/**
 * A record that could not be handled. The original bytes are preserved verbatim as base64:
 * re-serializing a message that failed to parse would destroy the evidence of why it failed.
 */
export interface DeadLetterEvent {
  readonly v: typeof EVENT_VERSION;
  readonly type: "dead-letter";
  readonly sourceTopic: string;
  readonly partition: number;
  readonly offset: string;
  readonly attempts: number;
  readonly error: string;
  readonly payloadBase64: string;
  readonly at: string;
}

export type NoyeetEvent = DecisionEvent | AnchorEvent | DeadLetterEvent;
