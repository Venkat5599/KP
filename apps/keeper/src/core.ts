/**
 * Keeper core: the decision loop, pure of transport.
 *
 * The loop is a function of injected dependencies so the logic is testable without a
 * chain or a gateway. The policy the keeper operates under is the gateway's; the
 * keeper itself only decides *when* to act, and the guard decides *whether* the act is
 * safe — the keeper cannot override a DENY, and a HOLD goes to the human gate.
 */

export interface Intent {
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

export interface KeeperConfig {
  readonly chainId: number;
  readonly target: string;
  readonly guard: string;
  readonly floorWei: bigint;
  readonly targetWei: bigint;
  readonly idPrefix: string;
}

export type KeeperOutcome =
  | { readonly kind: "noop"; readonly healthFactorWei: bigint }
  | { readonly kind: "submitted"; readonly healthFactorWei: bigint; readonly intent: Intent }
  | { readonly kind: "held"; readonly healthFactorWei: bigint; readonly intent: Intent }
  | { readonly kind: "denied"; readonly healthFactorWei: bigint; readonly intent: Intent };

export interface KeeperDeps {
  /** Live position read; the keeper never guesses at state. */
  readHealthFactorWei(): Promise<bigint>;
  /** Submit an intent to the authorization gateway. */
  submit(intent: Intent): Promise<"submitted" | "held" | "denied">;
  now(): Date;
}

const BORROW_MORE = "0x9d0bf2e9"; // borrowMore(uint256)
const GET_USER_ACCOUNT_DATA = "0xbf92857c"; // getUserAccountData(address)

/** The guard's own probe: read the position contract's health factor for the guard. */
export function probeCalldata(guard: string): string {
  return `${GET_USER_ACCOUNT_DATA}${guard.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function borrowMoreCalldata(healthFactorWei: bigint): string {
  return `${BORROW_MORE}${healthFactorWei.toString(16).padStart(64, "0")}`;
}

/**
 * Decide whether to act. Above the floor: nothing. Below: propose moving the health
 * factor to the configured target — a change the guard will re-check against the
 * floor before allowing.
 */
export function decide(
  healthFactorWei: bigint,
  floorWei: bigint,
  targetWei: bigint,
): bigint | null {
  if (healthFactorWei >= floorWei) return null;
  return targetWei;
}

export function buildIntent(
  config: KeeperConfig,
  id: string,
  now: Date,
  healthFactorWei: bigint,
): Intent {
  return {
    id,
    chainId: config.chainId,
    calls: [
      { target: config.target, value: "0", data: borrowMoreCalldata(healthFactorWei) },
    ],
    invariants: [
      {
        target: config.target,
        probe: probeCalldata(config.guard),
        word: 5,
        op: "GTE",
        threshold: config.floorWei.toString(),
      },
    ],
    rationale: `health factor below floor, proposing rebalance to ${healthFactorWei}`,
    submittedAt: now.toISOString(),
  };
}

/** One loop tick: read, decide, submit (or not). Never throws on a denied intent. */
export async function runOnce(deps: KeeperDeps, config: KeeperConfig, nonce: number): Promise<KeeperOutcome> {
  const healthFactorWei = await deps.readHealthFactorWei();
  const action = decide(healthFactorWei, config.floorWei, config.targetWei);

  if (action === null) {
    return { kind: "noop", healthFactorWei };
  }

  const intent = buildIntent(config, `${config.idPrefix}-${nonce}`, deps.now(), action);
  const status = await deps.submit(intent);

  switch (status) {
    case "submitted":
      return { kind: "submitted", healthFactorWei, intent };
    case "held":
      return { kind: "held", healthFactorWei, intent };
    default:
      return { kind: "denied", healthFactorWei, intent };
  }
}
