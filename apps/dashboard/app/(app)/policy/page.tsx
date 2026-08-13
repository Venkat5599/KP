import { PolicyCanvas } from "@/components/canvas/policy-canvas";
import { loadConfig } from "@/lib/env";
import { policyToBlocks } from "@/lib/canvas/policy-to-blocks";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Policy",
  description: "Compose the policy document and invariant tuples the gateway and guard consume.",
  path: "/policy",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The policy this deployment actually runs, derived from env or the configured defaults. */
function deployedPolicy(config: ReturnType<typeof loadConfig>): string {
  const fromEnv = process.env["NOYEET_POLICY"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const target = config.targetAddress;
  return JSON.stringify({
    version: 1,
    name: "sepolia-rebalance-dapp",
    chains: [config.chainId],
    targets: {
      allow: [target],
      selectors: { [target]: ["0x9d0bf2e9", "0x371fd8e6"] },
    },
    limits: {
      maxNativeValuePerIntent: "1000000000000000000",
      maxNativeValuePerWindow: "3000000000000000000",
      windowSeconds: 3600,
      maxIntentsPerWindow: 5,
      maxGas: "1500000",
    },
    holdAbove: { nativeValue: "10000000000000000", unknownCounterparty: false },
    approvals: { maxApproval: "1000000000" },
    minInvariants: 1,
  });
}

export default async function PolicyPage(): Promise<ReactNode> {
  const config = loadConfig();
  const policyJson = deployedPolicy(config);
  const parsed = JSON.parse(policyJson) as Record<string, unknown>;

  const { blocks: policyBlocks, unmapped, carryOver } = policyToBlocks(parsed);

  // The invariant floor comes from the configured health factor floor (the same value
  // /api/execute asserts), so the canvas artifact matches the live pipeline.
  const floorBlocks =
    config.healthFactorFloor === "" || config.targetAddress === "" || config.guardAddress === ""
      ? []
      : [
          {
            id: "invariantFloor-deployed",
            kind: "invariantFloor" as const,
            x: 940,
            y: 0,
            values: {
              target: config.targetAddress,
              probe: "0xbf92857c",
              word: "5",
              threshold: config.healthFactorFloor,
            },
          },
        ];

  const initialBlocks = [...policyBlocks, ...floorBlocks];
  const initialName = typeof parsed["name"] === "string" ? parsed["name"] : "unnamed policy";

  return (
    <section aria-labelledby="policy-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="policy-heading">
          Policy
        </h1>
        {unmapped.length > 0 ? (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 font-mono text-[11px] text-amber-600">
            {unmapped.length} field(s) in the deployed policy have no canvas block
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <PolicyCanvas
          initialBlocks={initialBlocks}
          deployedPolicyJson={policyJson}
          initialName={initialName}
          carryOver={carryOver}
        />
      </div>
    </section>
  );
}
