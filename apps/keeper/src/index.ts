/**
 * Keeper entrypoint.
 *
 * A long-running loop that reads a position contract's health factor over RPC and
 * submits rebalance intents to the noyeet gateway. Fail-fast on missing env before
 * anything else touches the network; the loop itself never throws on a denied or
 * held intent — those are logged outcomes.
 *
 * Required env: KEEPER_RPC_URL, KEEPER_TARGET_ADDRESS, KEEPER_GUARD_ADDRESS,
 * GATEWAY_URL. Optional: KEEPER_HF_FLOOR (wei, default 1.4e18),
 * KEEPER_HF_TARGET (wei, default 1.5e18), KEEPER_INTERVAL_SECONDS (default 60),
 * KEEPER_CHAIN_ID (default 11155111), KEEPER_ID_PREFIX (default "keeper").
 */

import { buildIntent, decide, probeCalldata, runOnce, type KeeperConfig, type KeeperDeps, type Intent } from "./core.ts";

const REQUIRED = ["KEEPER_RPC_URL", "KEEPER_TARGET_ADDRESS", "KEEPER_GUARD_ADDRESS", "GATEWAY_URL"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`missing env: ${name}`);
  return value;
}

function config(): KeeperConfig {
  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) throw new Error(`missing env: ${missing.join(", ")}`);

  return {
    chainId: Number(process.env["KEEPER_CHAIN_ID"] ?? 11155111),
    target: requireEnv("KEEPER_TARGET_ADDRESS"),
    guard: requireEnv("KEEPER_GUARD_ADDRESS"),
    floorWei: BigInt(process.env["KEEPER_HF_FLOOR"] ?? "1400000000000000000"),
    targetWei: BigInt(process.env["KEEPER_HF_TARGET"] ?? "1500000000000000000"),
    idPrefix: process.env["KEEPER_ID_PREFIX"] ?? "keeper",
  };
}

const GET_USER_ACCOUNT_DATA = "0xbf92857c";

/**
 * Live eth_call to the position contract; the keeper never caches chain state.
 * getUserAccountData returns six words: collateral (0), debt (1), …, health
 * factor (5). One read, three values.
 */
async function readPosition(target: string, guard: string): Promise<{ healthFactorWei: bigint; collateralWei: bigint; debtWei: bigint }> {
  const rpc = requireEnv("KEEPER_RPC_URL");
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        { to: target, data: `${GET_USER_ACCOUNT_DATA}${guard.slice(2).toLowerCase().padStart(64, "0")}` },
        "latest",
      ],
    }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (payload.error) throw new Error(`RPC: ${payload.error.message ?? "error"}`);
  const raw = (payload.result ?? "0x").slice(2);
  const word = (index: number) => BigInt(`0x${raw.slice(index * 64, (index + 1) * 64)}`);
  return { collateralWei: word(0), debtWei: word(1), healthFactorWei: word(5) };
}

async function submit(intent: Intent): Promise<"submitted" | "held" | "denied"> {
  const gateway = requireEnv("GATEWAY_URL").replace(/\/+$/, "");
  const response = await fetch(`${gateway}/v1/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent, idempotencyKey: intent.id }),
  });
  if (!response.ok) {
    throw new Error(`gateway HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as { status: string };
  switch (body.status) {
    case "submitted":
      return "submitted";
    case "held":
      return "held";
    case "denied":
      return "denied";
    default:
      throw new Error(`unexpected gateway status: ${body.status}`);
  }
}

async function main(): Promise<void> {
  const cfg = config();
  const gateway = requireEnv("GATEWAY_URL");
  const deps: KeeperDeps = {
    readPosition: () => readPosition(cfg.target, cfg.guard),
    submit,
    now: () => new Date(),
  };

  const intervalMs = Number(process.env["KEEPER_INTERVAL_SECONDS"] ?? 60) * 1000;
  let nonce = 0;

  console.log(`noyeet keeper: ${cfg.target} via ${gateway}, floor ${cfg.floorWei}, target ${cfg.targetWei}`);

  for (;;) {
    try {
      const outcome = await runOnce(deps, cfg, nonce++);
      switch (outcome.kind) {
        case "noop":
          console.log(`tick ${nonce - 1}: healthy (${outcome.healthFactorWei}), no action`);
          break;
        case "submitted":
          console.log(`tick ${nonce - 1}: submitted ${outcome.intent.id}`);
          break;
        case "held":
          console.log(`tick ${nonce - 1}: ${outcome.intent.id} HELD — waiting on the human gate`);
          break;
        case "denied":
          console.log(`tick ${nonce - 1}: ${outcome.intent.id} DENIED by the guard`);
          break;
      }
    } catch (error) {
      // A failed tick must not kill the keeper: it logs and waits for the next one.
      console.error(`tick ${nonce - 1} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
