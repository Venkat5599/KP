/**
 * Configuration, validated at boot.
 *
 * Every value is read once, here, and the process refuses to start if a required one is
 * missing. The alternative — reading `process.env` at the point of use — means a missing
 * key surfaces as a 500 on the first request that happens to need it, which in this system
 * could be hours after deploy and after the operator has already told an agent it is safe
 * to run. Fail at boot, loudly, or do not boot.
 */

export interface GatewayConfig {
  readonly port: number;
  readonly keeperhub: { readonly apiKey: string; readonly baseUrl: string };
  readonly guard: `0x${string}`;
  readonly policyPath: string;
  readonly kafka: { readonly brokers: readonly string[]; readonly enabled: boolean };
  readonly otlp: { readonly endpoint: string; readonly enabled: boolean };
  readonly breaker: {
    readonly failureThreshold: number;
    readonly cooldownMs: number;
    readonly successThreshold: number;
  };
  readonly serviceVersion: string;
}

export class ConfigError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Gateway cannot start. Missing or invalid environment: ${missing.join(", ")}. ` +
        `Copy .env.example and fill these in.`,
    );
    this.name = "ConfigError";
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const missing: string[] = [];

  const apiKey = env["KEEPERHUB_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") missing.push("KEEPERHUB_API_KEY");

  const guard = env["NOYEET_GUARD_ADDRESS"];
  if (guard === undefined || !ADDRESS.test(guard)) {
    missing.push("NOYEET_GUARD_ADDRESS (must be a 20-byte 0x address)");
  }

  const policyPath = env["NOYEET_POLICY_PATH"];
  if (policyPath === undefined || policyPath.trim() === "") missing.push("NOYEET_POLICY_PATH");

  if (missing.length > 0) throw new ConfigError(missing);

  return {
    port: int(env["PORT"], 8080),
    keeperhub: {
      apiKey: apiKey as string,
      baseUrl: env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    },
    guard: guard as `0x${string}`,
    policyPath: policyPath as string,
    kafka: {
      brokers: (env["KAFKA_BROKERS"] ?? "localhost:19092").split(",").map((b) => b.trim()),
      enabled: bool(env["KAFKA_ENABLED"], true),
    },
    otlp: {
      endpoint: env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] ?? "http://localhost:4318/v1/traces",
      enabled: bool(env["OTEL_ENABLED"], true),
    },
    breaker: {
      failureThreshold: int(env["BREAKER_FAILURE_THRESHOLD"], 5),
      cooldownMs: int(env["BREAKER_COOLDOWN_MS"], 30_000),
      successThreshold: int(env["BREAKER_SUCCESS_THRESHOLD"], 2),
    },
    serviceVersion: env["NOYEET_VERSION"] ?? "0.1.0",
  };
}
