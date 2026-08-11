import type { Decision, EvalContext, Intent, Reason } from "./types.ts";
import type { Policy } from "./schema.ts";
import { ALL_RULES, type Rule } from "./rules.ts";

/**
 * Evaluate an intent against a policy.
 *
 * Pure: the same (intent, policy, context) always yields the same decision, which is what
 * makes receipts reproducible by any third party. DENY dominates HOLD; HOLD dominates ALLOW.
 * All reasons are returned, not just the first, so an operator sees every problem at once.
 */
export function evaluate(
  intent: Intent,
  policy: Policy,
  ctx: EvalContext,
  rules: readonly Rule[] = ALL_RULES,
): Decision {
  const reasons: Reason[] = [];
  for (const rule of rules) reasons.push(...rule(intent, policy, ctx));

  const denied = reasons.some((r) => r.severity === "deny");
  const held = reasons.some((r) => r.severity === "hold");

  return {
    verdict: denied ? "DENY" : held ? "HOLD" : "ALLOW",
    // DENY reasons first, then HOLD, so the headline reason leads.
    reasons: [...reasons].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "deny" ? -1 : 1,
    ),
  };
}
