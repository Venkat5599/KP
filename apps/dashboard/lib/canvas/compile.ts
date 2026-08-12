import { BLOCKS, specFor, type BlockKind } from "./blocks.ts";

/**
 * Compile placed blocks into the two artifacts the system actually consumes.
 *
 * The policy document goes to the gateway, where a pure VM evaluates it before anything
 * touches the chain. The invariant tuples go into executeGuarded, where they are asserted
 * after the calls run and revert the transaction if a bound breaks.
 *
 * Those are different mechanisms with different failure modes, and the canvas keeps them
 * visually separate for that reason. A policy rule refuses an intent before it exists. An
 * invariant refuses a state after the calls have run. Conflating them is how an operator
 * ends up believing a bound is enforced on chain when it only ever lived in a config file.
 *
 * Pure, like the policy VM it feeds. Same reasoning: a compiler that reads a clock or a
 * network cannot be reasoned about from its inputs alone.
 */

export interface PlacedBlock {
  readonly id: string;
  readonly kind: BlockKind;
  readonly x: number;
  readonly y: number;
  readonly values: Record<string, string>;
}

export interface CompileIssue {
  readonly blockId: string | null;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface InvariantTuple {
  readonly target: string;
  readonly probe: string;
  readonly word: number;
  /** Guard enum index: 0 GTE, 1 LTE, 2 EQ, 3 REL_DEC_MAX, 4 REL_INC_MAX. */
  readonly op: number;
  readonly threshold: string;
}

export interface Compiled {
  readonly policy: Record<string, unknown>;
  readonly invariants: readonly InvariantTuple[];
  readonly issues: readonly CompileIssue[];
  /** True when the policy would be accepted and at least one invariant is declared. */
  readonly deployable: boolean;
}

export interface CompileOptions {
  /** Policy fields with no block representation, carried through unchanged. */
  readonly carryOver?: Record<string, unknown>;
  /** The policy name from the canvas toolbar. */
  readonly name?: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR = /^0x[0-9a-fA-F]{8}$/;
const UINT = /^\d+$/;

function first(blocks: readonly PlacedBlock[], kind: BlockKind): PlacedBlock | undefined {
  return blocks.find((b) => b.kind === kind);
}

function value(block: PlacedBlock | undefined, key: string, fallback: string): string {
  const raw = block?.values[key];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

/** Field-level validation. Every message names the block so the canvas can point at it. */
function validate(blocks: readonly PlacedBlock[]): CompileIssue[] {
  const issues: CompileIssue[] = [];

  for (const block of blocks) {
    const spec = specFor(block.kind);
    for (const field of spec.fields) {
      const raw = (block.values[field.key] ?? "").trim();

      if (raw === "") {
        issues.push({
          blockId: block.id,
          severity: "error",
          message: `${spec.title}: ${field.label} is empty.`,
        });
        continue;
      }

      const bad =
        (field.format === "address" && !ADDRESS.test(raw)) ||
        (field.format === "selector" && !SELECTOR.test(raw)) ||
        (field.format === "uint" && !UINT.test(raw)) ||
        (field.format === "int" && !UINT.test(raw));

      if (bad) {
        issues.push({
          blockId: block.id,
          severity: "error",
          message: `${spec.title}: ${field.label} is not a valid ${field.format}.`,
        });
      }

      if (field.format === "hours" && (!UINT.test(raw) || Number(raw) > 24)) {
        issues.push({
          blockId: block.id,
          severity: "error",
          message: `${spec.title}: ${field.label} must be an hour between 0 and 24.`,
        });
      }
    }
  }

  return issues;
}

function mergeInto(target: Record<string, unknown>, extra: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(extra)) {
    const existing = target[key];
    if (
      typeof existing === "object" && existing !== null && !Array.isArray(existing) &&
      typeof value === "object" && value !== null && !Array.isArray(value)
    ) {
      mergeInto(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
}

export function compile(blocks: readonly PlacedBlock[], options: CompileOptions = {}): Compiled {
  const issues = validate(blocks);

  const targets = blocks.filter((b) => b.kind === "target");
  const selectors = blocks.filter((b) => b.kind === "selector");
  const invariantBlocks = blocks.filter((b) => specFor(b.kind).layer === "invariant");

  // Structural findings. These are not malformed input; they are policies that would be
  // accepted and then behave in a way the operator almost certainly did not intend.
  if (targets.length === 0) {
    issues.push({
      blockId: null,
      severity: "error",
      message: "No allowlisted target. Every call would be refused, so the agent can do nothing.",
    });
  }

  if (invariantBlocks.length === 0) {
    issues.push({
      blockId: null,
      severity: "error",
      message:
        "No invariant. Nothing would be asserted on chain, so the guard could not refuse a bad outcome.",
    });
  }

  const allowed = new Set(targets.map((t) => value(t, "address", "").toLowerCase()));
  for (const sel of selectors) {
    const on = value(sel, "address", "").toLowerCase();
    if (on !== "" && !allowed.has(on)) {
      issues.push({
        blockId: sel.id,
        severity: "warning",
        message: "Scoped to a contract that is not allowlisted, so this function can never run.",
      });
    }
  }

  const cap = first(blocks, "valueCap");
  const hold = first(blocks, "holdAbove");
  if (cap !== undefined && hold !== undefined) {
    const capValue = value(cap, "maxPerIntent", "0");
    const holdValue = value(hold, "nativeValue", "0");
    if (UINT.test(capValue) && UINT.test(holdValue) && BigInt(holdValue) > BigInt(capValue)) {
      issues.push({
        blockId: hold.id,
        severity: "warning",
        message: "The review threshold sits above the value cap, so nothing will ever reach a human.",
      });
    }
  }

  const rate = first(blocks, "rateLimit");
  const approval = first(blocks, "approvalBound");
  const schedule = first(blocks, "schedule");

  const selectorMap: Record<string, string[]> = {};
  for (const sel of selectors) {
    const on = value(sel, "address", "");
    const code = value(sel, "selector", "");
    if (on === "" || code === "") continue;
    (selectorMap[on] ??= []).push(code);
  }

  const policy: Record<string, unknown> = {
    version: 1,
    name: "canvas-policy",
    chains: [11155111],
    targets: {
      allow: targets.map((t) => value(t, "address", "")).filter((a) => a !== ""),
      selectors: selectorMap,
    },
    limits: {
      maxNativeValuePerIntent: value(cap, "maxPerIntent", "0"),
      maxNativeValuePerWindow: value(rate, "maxValue", "0"),
      windowSeconds: Number(value(rate, "windowSeconds", "3600")),
      maxIntentsPerWindow: Number(value(rate, "maxIntents", "1")),
      maxGas: "2000000",
    },
    holdAbove: { nativeValue: value(hold, "nativeValue", "0"), unknownCounterparty: true },
    approvals: { maxApproval: value(approval, "maxApproval", "0") },
    minInvariants: Math.max(1, invariantBlocks.length),
  };

  if (schedule !== undefined) {
    policy["schedule"] = {
      allowedHoursUtc: [
        Number(value(schedule, "startHour", "0")),
        Number(value(schedule, "endHour", "24")),
      ],
    };
  }

  if (options.name !== undefined && options.name.trim() !== "") policy["name"] = options.name;
  if (options.carryOver !== undefined) mergeInto(policy, options.carryOver);

  const invariants: InvariantTuple[] = invariantBlocks.map((block) => ({
    target: value(block, "target", ""),
    probe: probeCalldata(value(block, "probe", ""), value(block, "target", "")),
    word: Number(value(block, "word", "0")),
    // GTE for a floor, REL_DEC_MAX for a drawdown. The guard reads these enum indices
    // directly, so they travel as numbers rather than names.
    op: block.kind === "invariantFloor" ? 0 : 3,
    threshold: value(block, "threshold", "0"),
  }));

  return {
    policy,
    invariants,
    issues,
    deployable: issues.every((i) => i.severity !== "error"),
  };
}

/**
 * A probe is a staticcall, so it needs full calldata rather than a bare selector. Both
 * probes in the catalogue take one address argument, and that argument is the guard itself,
 * because the guard is what holds the position being measured.
 */
function probeCalldata(selector: string, subject: string): string {
  if (!SELECTOR.test(selector)) return selector;
  const arg = ADDRESS.test(subject)
    ? subject.slice(2).toLowerCase().padStart(64, "0")
    : "".padStart(64, "0");
  return `${selector}${arg}`;
}

export const BLOCK_COUNT = BLOCKS.length;
