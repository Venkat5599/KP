import type { Call, EvalContext, Hex, Intent, Reason } from "./types.ts";
import type { Policy } from "./schema.ts";

/** A rule is a pure function. It returns reasons it raised, or an empty array. */
export type Rule = (intent: Intent, policy: Policy, ctx: EvalContext) => Reason[];

const ERC20_APPROVE = "0x095ea7b3";
const lower = (s: string): string => s.toLowerCase();
const selectorOf = (data: Hex): string => (data.length >= 10 ? lower(data.slice(0, 10)) : "0x");
const big = (s: string): bigint => BigInt(s);
const sumValues = (calls: readonly Call[]): bigint =>
  calls.reduce((acc, c) => acc + big(c.value), 0n);

/** Decode the amount argument of approve(address,uint256) without an ABI library. */
function approvalAmount(data: Hex): bigint | null {
  if (selectorOf(data) !== ERC20_APPROVE) return null;
  // 4-byte selector + 32-byte spender + 32-byte amount = 68 bytes = 138 hex chars incl. 0x
  if (data.length < 138) return null;
  return BigInt(`0x${data.slice(74, 138)}`);
}

export const chainAllowed: Rule = (intent, policy) =>
  policy.chains.includes(intent.chainId)
    ? []
    : [{
        code: "CHAIN_NOT_ALLOWED",
        severity: "deny",
        message: `Chain ${intent.chainId} is not in this policy.`,
        detail: { chainId: intent.chainId, allowed: policy.chains.join(",") },
      }];

export const targetAllowlist: Rule = (intent, policy) => {
  const allowed = new Set(policy.targets.allow.map(lower));
  return intent.calls.flatMap((call, index) =>
    allowed.has(lower(call.target))
      ? []
      : [{
          code: "TARGET_NOT_ALLOWED",
          severity: "deny" as const,
          message: `Call ${index} targets ${call.target}, which is not allowlisted.`,
          detail: { index, target: call.target },
        }],
  );
};

export const selectorAllowlist: Rule = (intent, policy) =>
  intent.calls.flatMap((call, index) => {
    const entry = policy.targets.selectors[lower(call.target) as Hex]
      ?? policy.targets.selectors[call.target as Hex];
    if (!entry || entry.includes("*")) return [];
    const sel = selectorOf(call.data);
    return entry.map(lower).includes(sel)
      ? []
      : [{
          code: "SELECTOR_NOT_ALLOWED",
          severity: "deny" as const,
          message: `Call ${index} uses selector ${sel}, which is not permitted on ${call.target}.`,
          detail: { index, selector: sel, target: call.target },
        }];
  });

export const valueCap: Rule = (intent, policy) => {
  const total = sumValues(intent.calls);
  const cap = big(policy.limits.maxNativeValuePerIntent);
  return total <= cap
    ? []
    : [{
        code: "VALUE_CAP_EXCEEDED",
        severity: "deny",
        message: `Intent moves ${total} wei, above the per-intent cap of ${cap}.`,
        detail: { value: total.toString(), cap: cap.toString() },
      }];
};

export const windowedLimits: Rule = (intent, policy, ctx) => {
  const cutoff = ctx.now.getTime() - policy.limits.windowSeconds * 1000;
  const recent = ctx.history.filter(
    (h) => h.verdict !== "DENY" && new Date(h.at).getTime() >= cutoff,
  );

  const reasons: Reason[] = [];

  if (recent.length + 1 > policy.limits.maxIntentsPerWindow) {
    reasons.push({
      code: "RATE_LIMIT_EXCEEDED",
      severity: "deny",
      message: `${recent.length} intents already executed in the last ${policy.limits.windowSeconds}s; limit is ${policy.limits.maxIntentsPerWindow}.`,
      detail: { count: recent.length, limit: policy.limits.maxIntentsPerWindow },
    });
  }

  const spent = recent.reduce((acc, h) => acc + big(h.nativeValue), 0n);
  const projected = spent + sumValues(intent.calls);
  const windowCap = big(policy.limits.maxNativeValuePerWindow);
  if (projected > windowCap) {
    reasons.push({
      code: "WINDOW_VALUE_EXCEEDED",
      severity: "deny",
      message: `This intent would bring window spend to ${projected} wei, above the cap of ${windowCap}.`,
      detail: { projected: projected.toString(), cap: windowCap.toString() },
    });
  }

  return reasons;
};

export const scheduleWindow: Rule = (_intent, policy, ctx) => {
  const schedule = policy.schedule;
  if (!schedule) return [];
  const [start, end] = schedule.allowedHoursUtc;
  const hour = ctx.now.getUTCHours();
  const inside = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  return inside
    ? []
    : [{
        code: "OUTSIDE_SCHEDULE",
        severity: "deny",
        message: `Execution is restricted to ${start}:00-${end}:00 UTC; it is currently ${hour}:00.`,
        detail: { hour, start, end },
      }];
};

export const approvalBound: Rule = (intent, policy) =>
  intent.calls.flatMap((call, index) => {
    const amount = approvalAmount(call.data);
    if (amount === null) return [];
    const max = big(policy.approvals.maxApproval);
    return amount <= max
      ? []
      : [{
          code: "APPROVAL_TOO_LARGE",
          severity: "deny" as const,
          message: `Call ${index} approves ${amount}, above the maximum of ${max}.`,
          detail: { index, amount: amount.toString(), max: max.toString() },
        }];
  });

export const gasCeiling: Rule = (_intent, policy, ctx) => {
  if (ctx.gasEstimate === undefined) return [];
  const estimate = big(ctx.gasEstimate);
  const ceiling = big(policy.limits.maxGas);
  return estimate <= ceiling
    ? []
    : [{
        code: "GAS_CEILING_EXCEEDED",
        severity: "deny",
        message: `Preflight estimated ${estimate} gas, above the ceiling of ${ceiling}.`,
        detail: { estimate: estimate.toString(), ceiling: ceiling.toString() },
      }];
};

export const invariantsRequired: Rule = (intent, policy) =>
  intent.invariants.length >= policy.minInvariants
    ? []
    : [{
        code: "TOO_FEW_INVARIANTS",
        severity: "deny",
        message: `Intent declares ${intent.invariants.length} invariants; policy requires at least ${policy.minInvariants}.`,
        detail: { got: intent.invariants.length, required: policy.minInvariants },
      }];

// ---------------------------------------------------------------- hold rules

export const holdOnLargeValue: Rule = (intent, policy) => {
  const total = sumValues(intent.calls);
  const threshold = big(policy.holdAbove.nativeValue);
  return total < threshold
    ? []
    : [{
        code: "HOLD_LARGE_VALUE",
        severity: "hold",
        message: `Moving ${total} wei is at or above the review threshold of ${threshold}.`,
        detail: { value: total.toString(), threshold: threshold.toString() },
      }];
};

export const holdOnUnknownCounterparty: Rule = (intent, policy, ctx) => {
  if (!policy.holdAbove.unknownCounterparty) return [];
  const known = new Set(ctx.knownCounterparties.map(lower));
  const seen = new Set<string>();
  return intent.calls.flatMap((call, index) => {
    const target = lower(call.target);
    if (known.has(target) || seen.has(target)) return [];
    seen.add(target);
    return [{
      code: "HOLD_UNKNOWN_COUNTERPARTY",
      severity: "hold" as const,
      message: `First interaction with ${call.target}.`,
      detail: { index, target: call.target },
    }];
  });
};

/** Evaluation order is stable so receipts are reproducible. */
export const ALL_RULES: readonly Rule[] = [
  chainAllowed,
  targetAllowlist,
  selectorAllowlist,
  valueCap,
  windowedLimits,
  scheduleWindow,
  approvalBound,
  gasCeiling,
  invariantsRequired,
  holdOnLargeValue,
  holdOnUnknownCounterparty,
];
