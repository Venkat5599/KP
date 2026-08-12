import { KeeperHubClient } from "@noyeet/keeperhub";
import { parsePolicy, type Policy } from "@noyeet/policy";
import { openStore, type ReceiptStore } from "@noyeet/store";
import { CircuitBreaker } from "@noyeet/resilience";
import { envTargets, type NotifyTargets } from "./notify.ts";

export interface GatewayConfig {
  readonly client: KeeperHubClient;
  readonly policy: Policy;
  /** keccak256 of the canonical policy document, committed onchain before the run. */
  readonly policyHash: `0x${string}`;
  readonly guard: `0x${string}`;
  /** JSON ABI of the guard's executeGuarded function. */
  readonly guardAbi: string;
  /** Every decision lands here; Postgres when DATABASE_URL is set, memory otherwise. */
  readonly store: ReceiptStore;
  /** HOLD notification targets; empty when no webhook is configured. */
  readonly targets: NotifyTargets;
  /**
   * Guards every call to KeeperHub. It fails CLOSED: while it is open the gateway
   * returns DENY rather than a permissive fallback, because an unreachable simulator
   * means the resulting state cannot be predicted, and an unpredictable state is the
   * one thing this system exists to refuse.
   */
  readonly breaker: CircuitBreaker;
  readonly kafka: { readonly brokers: readonly string[]; readonly enabled: boolean };
  readonly otlp: { readonly endpoint: string; readonly enabled: boolean };
  readonly serviceVersion: string;
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
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

  const breaker = new CircuitBreaker({
    failureThreshold: int(env["BREAKER_FAILURE_THRESHOLD"], 5),
    cooldownMs: int(env["BREAKER_COOLDOWN_MS"], 30_000),
    successThreshold: int(env["BREAKER_SUCCESS_THRESHOLD"], 2),
  });

  return {
    client: new KeeperHubClient({
      apiKey: env["KEEPERHUB_API_KEY"] as string,
      baseUrl: env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
      breaker,
    }),
    breaker,
    kafka: {
      brokers: (env["KAFKA_BROKERS"] ?? "localhost:19092").split(",").map((b) => b.trim()),
      enabled: bool(env["KAFKA_ENABLED"], false),
    },
    otlp: {
      endpoint: env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] ?? "http://localhost:4318/v1/traces",
      enabled: bool(env["OTEL_ENABLED"], false),
    },
    serviceVersion: env["NOYEET_VERSION"] ?? "0.1.0",
    policy,
    policyHash: env["NOYEET_POLICY_HASH"] as `0x${string}`,
    guard: env["NOYEET_GUARD_ADDRESS"] as `0x${string}`,
    guardAbi: env["NOYEET_GUARD_ABI"] ?? DEFAULT_GUARD_ABI,
    store: openStore(env),
    targets: envTargets(env),
  };
}
