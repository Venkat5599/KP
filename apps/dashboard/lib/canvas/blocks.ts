/**
 * The block catalogue for the policy canvas.
 *
 * A block is a rule or an invariant the operator can place. Placing blocks composes a
 * policy document and a set of on-chain invariants; the canvas compiles both live, so what
 * the operator sees is the actual artifact the gateway and the guard consume, not a picture
 * of one.
 *
 * This module is pure. It performs no I/O, reads no clock, and imports nothing from React,
 * so the compiler can be unit-tested on its own and the canvas stays a thin rendering layer
 * over it.
 */

export type BlockKind =
  | "target"
  | "selector"
  | "valueCap"
  | "approvalBound"
  | "rateLimit"
  | "schedule"
  | "holdAbove"
  | "invariantFloor"
  | "invariantDrop";

/** Which half of the system a block ends up in. The two are enforced very differently. */
export type BlockLayer = "policy" | "invariant";

export interface BlockField {
  readonly key: string;
  readonly label: string;
  readonly format: "uint" | "address" | "selector" | "int" | "hours";
  readonly initial: string;
}

export interface BlockSpec {
  readonly kind: BlockKind;
  readonly layer: BlockLayer;
  readonly title: string;
  /** One sentence, written for whoever has to approve or debug a refusal. */
  readonly summary: string;
  readonly fields: readonly BlockField[];
  /** Placing more than one is meaningless, so the rail disables it once used. */
  readonly singleton: boolean;
}

const TARGET = "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B";

export const BLOCKS: readonly BlockSpec[] = [
  {
    kind: "target",
    layer: "policy",
    title: "Allowlisted target",
    summary: "The agent may call this contract. Anything not listed is refused outright.",
    singleton: false,
    fields: [{ key: "address", label: "Contract", format: "address", initial: TARGET }],
  },
  {
    kind: "selector",
    layer: "policy",
    title: "Permitted function",
    summary: "Narrows an allowlisted target to specific functions, by 4-byte selector.",
    singleton: false,
    fields: [
      { key: "address", label: "On contract", format: "address", initial: TARGET },
      { key: "selector", label: "Selector", format: "selector", initial: "0x9d0bf2e9" },
    ],
  },
  {
    kind: "valueCap",
    layer: "policy",
    title: "Value cap",
    summary: "The most native value one intent may move.",
    singleton: true,
    fields: [
      { key: "maxPerIntent", label: "Per intent (wei)", format: "uint", initial: "1000000000000000000" },
    ],
  },
  {
    kind: "approvalBound",
    layer: "policy",
    title: "Approval bound",
    summary: "Rejects any ERC-20 approval above this amount, which blocks the infinite approve.",
    singleton: true,
    fields: [
      { key: "maxApproval", label: "Maximum (wei)", format: "uint", initial: "1000000000000000000" },
    ],
  },
  {
    kind: "rateLimit",
    layer: "policy",
    title: "Rate limit",
    summary: "Caps how many intents and how much value clear inside a rolling window.",
    singleton: true,
    fields: [
      { key: "maxIntents", label: "Intents", format: "int", initial: "20" },
      { key: "windowSeconds", label: "Window (s)", format: "int", initial: "3600" },
      { key: "maxValue", label: "Value (wei)", format: "uint", initial: "5000000000000000000" },
    ],
  },
  {
    kind: "schedule",
    layer: "policy",
    title: "Schedule window",
    summary: "Execution is permitted only inside these UTC hours.",
    singleton: true,
    fields: [
      { key: "startHour", label: "From (UTC)", format: "hours", initial: "8" },
      { key: "endHour", label: "To (UTC)", format: "hours", initial: "20" },
    ],
  },
  {
    kind: "holdAbove",
    layer: "policy",
    title: "Review threshold",
    summary: "At or above this value the intent is held for a human instead of executing.",
    singleton: true,
    fields: [
      { key: "nativeValue", label: "Hold above (wei)", format: "uint", initial: "500000000000000000" },
    ],
  },
  {
    kind: "invariantFloor",
    layer: "invariant",
    title: "Health factor floor",
    summary:
      "After the calls run this reading must sit at or above the floor, or the whole transaction reverts.",
    singleton: false,
    fields: [
      { key: "target", label: "Read from", format: "address", initial: TARGET },
      { key: "probe", label: "Probe selector", format: "selector", initial: "0xbf92857c" },
      { key: "word", label: "Return word", format: "int", initial: "5" },
      { key: "threshold", label: "Floor (wei)", format: "uint", initial: "1400000000000000000" },
    ],
  },
  {
    kind: "invariantDrop",
    layer: "invariant",
    title: "Maximum drawdown",
    summary: "A reading may fall by at most this much across the transaction, measured before and after.",
    singleton: false,
    fields: [
      { key: "target", label: "Read from", format: "address", initial: TARGET },
      { key: "probe", label: "Probe selector", format: "selector", initial: "0x70a08231" },
      { key: "word", label: "Return word", format: "int", initial: "0" },
      { key: "threshold", label: "Max drop (wei)", format: "uint", initial: "100000000000000000" },
    ],
  },
];

export function specFor(kind: BlockKind): BlockSpec {
  const spec = BLOCKS.find((b) => b.kind === kind);
  if (spec === undefined) throw new Error(`Unknown block kind: ${kind}`);
  return spec;
}

export function initialValues(kind: BlockKind): Record<string, string> {
  return Object.fromEntries(specFor(kind).fields.map((f) => [f.key, f.initial]));
}
