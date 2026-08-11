import { evaluate, type Decision, type EvalContext, type Intent, type Policy } from "@noyeet/policy";
import {
  describeDenial,
  type ContractCallRequest,
  type KeeperHubClient,
  type SimulationOutcome,
} from "@noyeet/keeperhub";
import { receiptDigest, type Receipt, type ReceiptReason } from "@noyeet/receipts";

export type Hex = `0x${string}`;

/**
 * The authorization pipeline.
 *
 * Order is deliberate. Static rules run first because they cost nothing and cannot be
 * gamed; simulation runs only for intents that survive them, since a simulated revert still
 * consumes upstream capacity.
 *
 * A static HOLD short-circuits before simulation: there is no value in predicting the
 * outcome of a transaction a human has not yet approved.
 */

export interface AuthorizeOptions {
  readonly client: Pick<KeeperHubClient, "simulateContractCall">;
  readonly policy: Policy;
  readonly policyHash: Hex;
  readonly guard: Hex;
  readonly guardAbi: string;
  /** Injected so the pipeline stays deterministic under test. */
  readonly now: () => Date;
}

export interface AuthorizeResult {
  readonly verdict: Decision["verdict"];
  readonly simulation: SimulationOutcome | null;
  readonly receipt: Receipt;
  readonly digest: Hex;
}

const OPS = ["GTE", "LTE", "EQ", "REL_DEC_MAX", "REL_INC_MAX"] as const;

/** Encode an intent as the guard-wrapped contract call KeeperHub will simulate. */
export function toGuardCall(intent: Intent, guard: Hex, guardAbi: string): ContractCallRequest {
  const calls = intent.calls.map((call) => [call.target, call.value, call.data]);
  const invariants = intent.invariants.map((inv) => [
    inv.target,
    inv.probe,
    inv.word,
    OPS.indexOf(inv.op),
    inv.threshold,
  ]);

  return {
    chainId: intent.chainId,
    contractAddress: guard,
    functionName: "executeGuarded",
    abi: guardAbi,
    functionArgs: JSON.stringify([calls, invariants]),
  };
}

export async function authorize(
  intent: Intent,
  context: EvalContext,
  options: AuthorizeOptions,
): Promise<AuthorizeResult> {
  const decision = evaluate(intent, options.policy, context);
  const reasons: ReceiptReason[] = decision.reasons.map((reason) => ({
    code: reason.code,
    severity: reason.severity,
    message: reason.message,
  }));

  if (decision.verdict !== "ALLOW") {
    return finish(intent, options, decision.verdict, reasons, null);
  }

  const simulation = await options.client.simulateContractCall(
    toGuardCall(intent, options.guard, options.guardAbi),
  );

  if (!simulation.wouldRevert) {
    return finish(intent, options, "ALLOW", reasons, simulation);
  }

  /**
   * A predicted revert is a denial, but the reason must name the right cause. A guard denial
   * is an invariant breach; `failureKind: "validation"` means KeeperHub refused before the
   * EVM ran, which is an operational problem, not an unsafe position. Conflating them would
   * report a broken health factor when the wallet was merely unfunded.
   */
  const denial = simulation.denial;
  const simulationReason: ReceiptReason = denial
    ? {
        code:
          denial.kind === "invariant" ? "INVARIANT_BROKEN" : `GUARD_${denial.kind.toUpperCase()}`,
        severity: "deny",
        message: describeDenial(denial),
      }
    : {
        code: simulation.failureKind === "validation" ? "PREFLIGHT_REJECTED" : "SIMULATION_REVERTED",
        severity: "deny",
        message: simulation.revertReason ?? "The transaction would revert.",
      };

  return finish(intent, options, "DENY", [...reasons, simulationReason], simulation);
}

function finish(
  intent: Intent,
  options: AuthorizeOptions,
  verdict: Decision["verdict"],
  reasons: readonly ReceiptReason[],
  simulation: SimulationOutcome | null,
): AuthorizeResult {
  const receipt: Receipt = {
    intentId: intent.id,
    intentHash: hashIntent(intent),
    policyHash: options.policyHash,
    guard: options.guard,
    chainId: intent.chainId,
    verdict,
    reasons,
    simulation: simulation
      ? {
          wouldRevert: simulation.wouldRevert,
          gasEstimate: readGas(simulation),
          ...(simulation.denial?.kind === "invariant"
            ? { invariantIndex: simulation.denial.index }
            : {}),
        }
      : null,
    execution: null,
    at: options.now().toISOString(),
  };

  return { verdict, simulation, receipt, digest: receiptDigest(receipt) };
}

/**
 * Hash the intent's executable content only. The agent's `rationale` is excluded on purpose:
 * it is untrusted prose, and including it would let an agent change the hash of an otherwise
 * identical transaction just by rewording its explanation.
 */
function hashIntent(intent: Intent): Hex {
  return receiptDigest({
    intentId: intent.id,
    intentHash: "0x",
    policyHash: "0x",
    guard: "0x",
    chainId: intent.chainId,
    verdict: "ALLOW",
    reasons: intent.calls.map((call) => ({
      code: call.target,
      severity: "deny" as const,
      message: `${call.value}:${call.data}`,
    })),
    simulation: null,
    execution: null,
    at: intent.submittedAt,
  });
}

function readGas(simulation: SimulationOutcome): string {
  const raw = simulation.raw;
  if (typeof raw === "object" && raw !== null) {
    const value = (raw as Record<string, unknown>)["gasEstimate"];
    if (typeof value === "string") return value;
  }
  return "0";
}
