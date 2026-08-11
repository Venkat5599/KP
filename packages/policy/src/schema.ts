import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "must be 0x-prefixed hex");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte address");
const uint = z.string().regex(/^\d+$/, "must be a decimal uint string");
const selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/, "must be a 4-byte selector");

/**
 * Policy schema. A policy file is content-hashed and the hash is committed onchain
 * before the run, so the rules in force at decision time are provable afterward.
 */
export const PolicySchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),

    /** Chains this policy authorizes. Anything else is denied outright. */
    chains: z.array(z.number().int().positive()).min(1),

    targets: z.object({
      /** Contracts the agent may call. Empty means none. */
      allow: z.array(address),
      /** Selectors permitted per target. "*" allows any selector on that target. */
      selectors: z.record(address, z.array(z.union([selector, z.literal("*")]))).default({}),
    }),

    limits: z.object({
      /** Max native value per intent, wei. */
      maxNativeValuePerIntent: uint,
      /** Max native value across the rolling window, wei. */
      maxNativeValuePerWindow: uint,
      windowSeconds: z.number().int().positive(),
      /** Max intents per window, whatever their value. */
      maxIntentsPerWindow: z.number().int().positive(),
      /** Preflight gas ceiling, gas units. */
      maxGas: uint,
    }),

    /** Values at or above these escalate to HOLD instead of executing. */
    holdAbove: z.object({
      nativeValue: uint,
      unknownCounterparty: z.boolean().default(true),
    }),

    schedule: z
      .object({
        /** UTC hours during which execution is permitted, inclusive start, exclusive end. */
        allowedHoursUtc: z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(24)]),
      })
      .optional(),

    approvals: z.object({
      /** Reject ERC-20 approvals above this amount, wei. Guards against infinite approve. */
      maxApproval: uint,
    }),

    /** Every intent must carry at least this many invariants. Zero disables the check. */
    minInvariants: z.number().int().min(0).default(1),
  })
  .strict();

export type Policy = z.infer<typeof PolicySchema>;

/** Parse and validate. Throws ZodError with a precise path on malformed policy. */
export function parsePolicy(input: unknown): Policy {
  return PolicySchema.parse(input);
}

export { hex, address, uint, selector };
