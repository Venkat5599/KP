/**
 * Map a real policy document (as the gateway consumes it) back into canvas blocks,
 * so the canvas opens editing the deployed artifact instead of a blank or mocked one.
 *
 * This is the inverse of the compile step in compile.ts. Anything in the document
 * that has no block representation is preserved in `unmapped` so nothing is silently
 * dropped when the operator hits compile again.
 */

import { BLOCKS, initialValues, type BlockKind } from "./blocks.ts";
import type { PlacedBlock } from "./compile.ts";

export interface PolicyToBlocks {
  readonly blocks: readonly PlacedBlock[];
  readonly unmapped: readonly { readonly path: string; readonly value: unknown }[];
  /** The unmapped fields, structured so compile() can carry them through unchanged. */
  readonly carryOver: Record<string, unknown>;
}

let counter = 0;
function nextId(kind: BlockKind): string {
  counter += 1;
  return `${kind}-${counter}`;
}

function block(kind: BlockKind, values: Record<string, string>, x: number, y: number): PlacedBlock {
  return { id: nextId(kind), kind, x, y, values: { ...initialValues(kind), ...values } };
}

export function policyToBlocks(policy: Record<string, unknown>): PolicyToBlocks {
  const blocks: PlacedBlock[] = [];
  const unmapped: { path: string; value: unknown }[] = [];
  const carryOver: Record<string, unknown> = {};

  const chains = policy["chains"];
  if (Array.isArray(chains) && chains.length > 0) {
    carryOver["chains"] = chains;
  } else {
    unmapped.push({ path: "chains", value: chains });
  }

  const targets = policy["targets"] as Record<string, unknown> | undefined;
  if (targets !== undefined) {
    const allow = targets["allow"];
    if (Array.isArray(allow)) {
      let y = 0;
      for (const address of allow) {
        if (typeof address === "string") {
          blocks.push(block("target", { address }, 40, y));
          y += 130;
        }
      }
    } else {
      unmapped.push({ path: "targets.allow", value: allow });
    }

    const selectors = targets["selectors"];
    if (selectors !== null && typeof selectors === "object") {
      let y = 0;
      for (const [address, sels] of Object.entries(selectors as Record<string, unknown>)) {
        if (Array.isArray(sels)) {
          for (const sel of sels) {
            if (typeof sel === "string") {
              blocks.push(block("selector", { address, selector: sel }, 320, y));
              y += 130;
            }
          }
        }
      }
    }
  } else {
    unmapped.push({ path: "targets", value: targets });
  }

  const limits = policy["limits"] as Record<string, unknown> | undefined;
  if (limits !== undefined) {
    const perIntent = limits["maxNativeValuePerIntent"];
    if (typeof perIntent === "string") {
      blocks.push(block("valueCap", { maxPerIntent: perIntent }, 600, 0));
    } else if (perIntent !== undefined) {
      unmapped.push({ path: "limits.maxNativeValuePerIntent", value: perIntent });
    }

    const perWindow = limits["maxNativeValuePerWindow"];
    const windowSeconds = limits["windowSeconds"];
    const maxIntents = limits["maxIntentsPerWindow"];
    if (typeof perWindow === "string" && typeof windowSeconds === "number" && typeof maxIntents === "number") {
      blocks.push(
        block(
          "rateLimit",
          {
            maxValue: perWindow,
            windowSeconds: String(windowSeconds),
            maxIntents: String(maxIntents),
          },
          600,
          140,
        ),
      );
    } else if (perWindow !== undefined || windowSeconds !== undefined || maxIntents !== undefined) {
      unmapped.push({ path: "limits.rateLimit", value: { perWindow, windowSeconds, maxIntents } });
    }

    if (limits["maxGas"] !== undefined) {
      unmapped.push({ path: "limits.maxGas", value: limits["maxGas"] });
      carryOver["limits"] = { ...(carryOver["limits"] as object), maxGas: limits["maxGas"] };
    }
  }

  const approvals = policy["approvals"] as Record<string, unknown> | undefined;
  if (approvals !== undefined) {
    const maxApproval = approvals["maxApproval"];
    if (typeof maxApproval === "string") {
      blocks.push(block("approvalBound", { maxApproval }, 600, 280));
    } else if (maxApproval !== undefined) {
      unmapped.push({ path: "approvals.maxApproval", value: maxApproval });
    }
  }

  const holdAbove = policy["holdAbove"] as Record<string, unknown> | undefined;
  if (holdAbove !== undefined) {
    const nativeValue = holdAbove["nativeValue"];
    if (typeof nativeValue === "string") {
      blocks.push(block("holdAbove", { nativeValue }, 600, 420));
    } else if (nativeValue !== undefined) {
      unmapped.push({ path: "holdAbove.nativeValue", value: nativeValue });
    }
    if (holdAbove["unknownCounterparty"] !== undefined) {
      unmapped.push({ path: "holdAbove.unknownCounterparty", value: holdAbove["unknownCounterparty"] });
      carryOver["holdAbove"] = {
        ...(carryOver["holdAbove"] as object),
        unknownCounterparty: holdAbove["unknownCounterparty"],
      };
    }
  }

  if (policy["minInvariants"] !== undefined) {
    unmapped.push({ path: "minInvariants", value: policy["minInvariants"] });
    carryOver["minInvariants"] = policy["minInvariants"];
  }

  return { blocks, unmapped, carryOver };
}

/** The catalogue, exported for the palette. */
export { BLOCKS };
