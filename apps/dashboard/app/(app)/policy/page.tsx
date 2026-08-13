import { PolicyCanvas } from "@/components/canvas/policy-canvas";
import { loadConfig } from "@/lib/env";
import { policyToBlocks } from "@/lib/canvas/policy-to-blocks";
import { createMetadata } from "@/lib/metadata";
import { shorten } from "@/lib/format";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Policy",
  description: "The policy this deployment enforces, in plain language — with the drag-and-drop canvas for composing.",
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

interface PolicyShape {
  readonly version?: unknown;
  readonly name?: unknown;
  readonly chains?: unknown;
  readonly targets?: { allow?: unknown; selectors?: Record<string, unknown> };
  readonly limits?: Record<string, unknown>;
  readonly holdAbove?: { nativeValue?: unknown; unknownCounterparty?: unknown };
  readonly approvals?: { maxApproval?: unknown };
  readonly minInvariants?: unknown;
}

const fmtEth = (wei: string): string => `${(Number(wei) / 1e18).toFixed(2)} ETH`;

/** Plain-language statements derived from the actual policy document. Nothing is invented. */
function describe(policy: PolicyShape): readonly { text: string; source: string }[] {
  const lines: { text: string; source: string }[] = [];
  const push = (text: string, source: string) => lines.push({ text, source });

  const chains = policy.chains;
  if (Array.isArray(chains)) {
    push(`only chain ${chains.join(", ")} is accepted`, "chains");
  }
  const allowed = policy.targets?.allow;
  if (Array.isArray(allowed) && allowed.length > 0) {
    push(
      `calls may only target ${allowed.map((a) => `${shorten(String(a), 8, 6)} (${allowed.length} contract${allowed.length === 1 ? "" : "s"})`).join(", ")}`,
      "targets.allow",
    );
  }
  const selectors = policy.targets?.selectors;
  if (selectors !== undefined) {
    for (const [target, list] of Object.entries(selectors)) {
      const names = Array.isArray(list)
        ? list.map((s) => {
            const hex = String(s).toLowerCase();
            if (hex === "0x9d0bf2e9") return "0x9d0bf2e9 borrowMore";
            if (hex === "0x371fd8e6") return "0x371fd8e6 repay";
            return String(s);
          })
        : [];
      push(`on ${shorten(target, 8, 6)} only ${names.join(", ")} may be called`, "targets.selectors");
    }
  }
  const limits = policy.limits ?? {};
  if (typeof limits["maxNativeValuePerIntent"] === "string") {
    push(`at most ${fmtEth(limits["maxNativeValuePerIntent"] as string)} of native value per intent`, "limits.maxNativeValuePerIntent");
  }
  if (typeof limits["maxNativeValuePerWindow"] === "string") {
    push(`at most ${fmtEth(limits["maxNativeValuePerWindow"] as string)} of native value per rolling window`, "limits.maxNativeValuePerWindow");
  }
  if (typeof limits["windowSeconds"] === "number") {
    push(`rate-limit window is ${limits["windowSeconds"]} seconds`, "limits.windowSeconds");
  }
  if (typeof limits["maxIntentsPerWindow"] === "number") {
    push(`at most ${limits["maxIntentsPerWindow"]} intents per window`, "limits.maxIntentsPerWindow");
  }
  if (typeof limits["maxGas"] === "string") {
    push(`gas ceiling of ${(Number(limits["maxGas"]) / 1e6).toFixed(1)}M`, "limits.maxGas");
  }
  const hold = policy.holdAbove;
  if (hold !== undefined && typeof hold.nativeValue === "string" && BigInt(hold.nativeValue) > 0n) {
    push(`intents moving ≥ ${fmtEth(hold.nativeValue)} of native value are HELD for a human`, "holdAbove.nativeValue");
  }
  if (hold !== undefined && hold.unknownCounterparty === true) {
    push("intents to unknown counterparties are HELD for a human", "holdAbove.unknownCounterparty");
  }
  if (policy.approvals !== undefined && typeof policy.approvals.maxApproval === "string") {
    push(`token approvals are capped at ${Number(policy.approvals.maxApproval).toLocaleString()}`, "approvals.maxApproval");
  }
  if (typeof policy.minInvariants === "number") {
    push(`every intent must carry at least ${policy.minInvariants} invariant(s)`, "minInvariants");
  }
  return lines;
}

/** The 12 decision rules, described from the engine that runs them. */
const RULES: readonly { code: string; effect: string }[] = [
  { code: "CHAIN_NOT_ALLOWED", effect: "intent is on a chain the policy does not accept" },
  { code: "TARGET_NOT_ALLOWED", effect: "the call targets a contract outside targets.allow" },
  { code: "SELECTOR_NOT_ALLOWED", effect: "the selector is not in the per-target allow list" },
  { code: "VALUE_CAP_EXCEEDED", effect: "native value exceeds maxNativeValuePerIntent" },
  { code: "WINDOW_VALUE_EXCEEDED", effect: "native value exceeds the per-window budget" },
  { code: "RATE_LIMIT_EXCEEDED", effect: "too many intents in the window" },
  { code: "GAS_CEILING_EXCEEDED", effect: "the composite exceeds the gas ceiling" },
  { code: "TOO_FEW_INVARIANTS", effect: "the intent carries fewer invariants than minInvariants" },
  { code: "APPROVAL_TOO_LARGE", effect: "an approval exceeds approvals.maxApproval" },
  { code: "HOLD_LARGE_VALUE", effect: "large native value → HOLD (human gate), not DENY" },
  { code: "HOLD_UNKNOWN_COUNTERPARTY", effect: "unknown counterparty → HOLD (human gate), not DENY" },
  { code: "OUTSIDE_SCHEDULE", effect: "outside the permitted schedule (when one is set)" },
];

export default async function PolicyPage(): Promise<ReactNode> {
  const config = loadConfig();
  const policyJson = deployedPolicy(config);
  const parsed = JSON.parse(policyJson) as PolicyShape;
  const statements = describe(parsed);
  const { blocks: policyBlocks, unmapped, carryOver } = policyToBlocks(parsed as unknown as Record<string, unknown>);
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
  const initialName = typeof parsed.name === "string" ? parsed.name : "unnamed policy";

  return (
    <section aria-labelledby="policy-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="policy-heading">
          Policy
        </h1>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[11px] text-emerald-600">
          matches the deployed policy
        </span>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[11px] text-emerald-600">
          deployable
        </span>
      </div>

      <div className="mt-4">
        <PolicyCanvas
          initialBlocks={initialBlocks}
          deployedPolicyJson={policyJson}
          initialName={initialName}
          carryOver={carryOver}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border/70 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What this policy does
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          derived from the document this deployment enforces ({initialName}, version {String(parsed.version ?? "?")})
        </p>
        <ul className="mt-3 space-y-2">
          {statements.map((statement) => (
            <li key={statement.source} className="flex items-start gap-2 font-mono text-xs">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>
                {statement.text}
                <span className="ml-2 text-muted-foreground">({statement.source})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What the guard enforces on chain
        </p>
        <p className="mt-2 font-mono text-xs">
          after the calls execute, the guard probes the position contract and reverts the
          whole transaction unless the health factor is still above the floor:
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl bg-foreground/[0.03] p-4">
          <code className="break-all font-mono text-[11px]">
            probe {shorten(config.targetAddress, 8, 6)}.getUserAccountData({shorten(config.guardAddress, 8, 6)})
            {" "}word 5 {" "}
            {config.healthFactorFloor === "" ? "— floor unset" : `≥ ${(Number(config.healthFactorFloor) / 1e18).toFixed(2)} (health factor floor)`}
          </code>
        </div>
        {unmapped.length > 0 ? (
          <p className="mt-2 font-mono text-[11px] text-amber-600">
            {unmapped.length} field(s) have no canvas block (they are enforced, just not editable in the canvas)
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          The decision rules
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border/70">
                <th className="py-2 pr-4 font-semibold text-muted-foreground">RULE</th>
                <th className="py-2 font-semibold text-muted-foreground">EFFECT</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule) => (
                <tr key={rule.code} className="border-b border-border/40">
                  <td className="py-2 pr-4 whitespace-nowrap">{rule.code}</td>
                  <td className="py-2 text-muted-foreground">{rule.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border/70 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          The policy document
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-foreground/[0.03] p-4 font-mono text-[11px]">{policyJson}</pre>
      </div>
    </section>
  );
}
