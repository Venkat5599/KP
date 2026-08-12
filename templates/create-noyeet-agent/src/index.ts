/**
 * create-noyeet-agent — the demo flow.
 *
 * 1. Build a guard-wrapped intent (a health-factor rebalance, like the keeper's).
 * 2. Ask the gateway to authorize it: policy VM, then a real guard simulation.
 * 3. If ALLOW and a KeeperHub key is present, broadcast through the gateway under an
 *    idempotency key and print the execution id.
 *
 * Fail-fast on missing env, before anything touches the network.
 */

interface Intent {
  readonly id: string;
  readonly chainId: number;
  readonly calls: readonly { target: string; value: string; data: string }[];
  readonly invariants: readonly {
    target: string;
    probe: string;
    word: number;
    op: string;
    threshold: string;
  }[];
  readonly rationale?: string;
  readonly submittedAt: string;
}

const REQUIRED = ["GATEWAY_URL", "CHAIN_ID", "TARGET_ADDRESS", "GUARD_ADDRESS"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`missing env: ${name}`);
  return value;
}

export function buildIntent(now: Date): Intent {
  const chainId = Number(requireEnv("CHAIN_ID"));
  const target = requireEnv("TARGET_ADDRESS");
  const guard = requireEnv("GUARD_ADDRESS");
  const floor = BigInt(process.env["HEALTH_FACTOR_FLOOR"] ?? "1400000000000000000");
  const targetHf = BigInt(process.env["HEALTH_FACTOR_TARGET"] ?? "1500000000000000000");

  return {
    id: `demo-${Math.floor(now.getTime() / 1000)}`,
    chainId,
    calls: [
      {
        target,
        value: "0",
        data: `0x9d0bf2e9${targetHf.toString(16).padStart(64, "0")}`,
      },
    ],
    invariants: [
      {
        target,
        probe: `0xbf92857c${guard.slice(2).toLowerCase().padStart(64, "0")}`,
        word: 5,
        op: "GTE",
        threshold: floor.toString(),
      },
    ],
    rationale: "create-noyeet-agent demo: propose a guarded rebalance",
    submittedAt: now.toISOString(),
  };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) throw new Error(`missing env: ${missing.join(", ")}`);

  const gateway = requireEnv("GATEWAY_URL").replace(/\/+$/, "");
  const intent = buildIntent(new Date());

  console.log(`authorizing ${intent.id} against ${gateway} ...`);
  const decision = await post<{ verdict: string; receipt: unknown; digest: string }>(
    `${gateway}/v1/authorize`,
    { intent },
  );
  console.log(`verdict: ${decision.verdict}`);
  console.log(`digest:  ${decision.digest}`);

  if (decision.verdict !== "ALLOW") {
    console.log("no broadcast: the intent was not allowed (see receipt reasons).");
    console.log(JSON.stringify(decision.receipt, null, 2));
    return;
  }

  if (process.env["KEEPERHUB_API_KEY"] === undefined || process.env["KEEPERHUB_API_KEY"] === "") {
    console.log("ALLOW, but KEEPERHUB_API_KEY is unset — stopping before broadcast.");
    return;
  }

  console.log("broadcasting under an idempotency key ...");
  const execution = await post<{ status: string; executionId: string; transactionHash: string | null }>(
    `${gateway}/v1/execute`,
    { intent, idempotencyKey: intent.id },
  );
  console.log(`status: ${execution.status}`);
  console.log(`executionId: ${execution.executionId}`);
  console.log(`tx: ${execution.transactionHash ?? "pending — poll GET /v1/executions/:id"}`);
}

// Run only when executed directly, so tests can import buildIntent without
// triggering the flow.
if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
