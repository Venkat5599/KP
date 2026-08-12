import { KeeperHubClient } from "@noyeet/keeperhub";
import { parsePolicy, type Policy } from "@noyeet/policy";

export interface GatewayConfig {
  readonly client: KeeperHubClient;
  readonly policy: Policy;
  /** keccak256 of the canonical policy document, committed onchain before the run. */
  readonly policyHash: `0x${string}`;
  readonly guard: `0x${string}`;
  /** JSON ABI of the guard's executeGuarded function. */
  readonly guardAbi: string;
}

const REQUIRED = [
  "KEEPERHUB_API_KEY",
  "NOYEET_POLICY",
  "NOYEET_POLICY_HASH",
  "NOYEET_GUARD_ADDRESS",
] as const;

/** The bundled default: the executeGuarded ABI, identical to the dashboard's probe. */
const DEFAULT_GUARD_ABI = JSON.stringify([
  {
    type: "function",
    name: "executeGuarded",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "inv",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "probe", type: "bytes" },
          { name: "word", type: "uint8" },
          { name: "op", type: "uint8" },
          { name: "threshold", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
]);

/**
 * Build the gateway configuration from the environment.
 *
 * The required-env check runs BEFORE any client construction: a missing variable must
 * fail the boot with the exact missing names, not crash opaquely later inside a
 * constructor or on the first request.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const missing = REQUIRED.filter((name) => {
    const value = env[name];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(", ")}`);
  }

  const policyJson = env["NOYEET_POLICY"] as string;
  let policy: Policy;
  try {
    policy = parsePolicy(JSON.parse(policyJson) as unknown);
  } catch (error) {
    throw new Error(`NOYEET_POLICY is not a valid policy: ${(error as Error).message}`);
  }

  return {
    client: new KeeperHubClient({
      apiKey: env["KEEPERHUB_API_KEY"] as string,
      baseUrl: env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    }),
    policy,
    policyHash: env["NOYEET_POLICY_HASH"] as `0x${string}`,
    guard: env["NOYEET_GUARD_ADDRESS"] as `0x${string}`,
    guardAbi: env["NOYEET_GUARD_ABI"] ?? DEFAULT_GUARD_ABI,
  };
}
