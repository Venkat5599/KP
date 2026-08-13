/**
 * Keeper core: the decision loop, pure of transport.
 *
 * The loop is a function of injected dependencies so the logic is testable without a
 * chain or a gateway. The policy the keeper operates under is the gateway's; the
 * keeper itself only decides *when* to act, and the guard decides *whether* the act is
 * safe — the keeper cannot override a DENY, and a HOLD goes to the human gate.
 *
 * Rebalance semantics: a position below the floor is fixed by REPAYING debt (raising
 * the health factor), never by borrowing more. The keeper proposes the repay that
 * would move the health factor to the configured target; the guard re-checks the
 * post-state against the floor before allowing.
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

export interface PositionRead {
  readonly healthFactorWei: bigint;
  readonly collateralWei: bigint;
  readonly debtWei: bigint;
}

export interface KeeperDeps {
  /** Live position read (one eth_call, never cached); the keeper never guesses at state. */
  readPosition(): Promise<PositionRead>;
  /** Submit an intent to the authorization gateway. */
  submit(intent: Intent): Promise<"submitted" | "held" | "denied">;
  now(): Date;
}

const REPAY = "0x371fd8e6"; // repay(uint256)
const GET_USER_ACCOUNT_DATA = "0xbf92857c"; // getUserAccountData(address)
const LTV_BPS = 7500n; // the position contract's liquidation threshold, 75%

/** The guard's own probe: read the position contract's health factor for the guard. */
export function probeCalldata(guard: string): string {
  return `${GET_USER_ACCOUNT_DATA}${guard.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function repayCalldata(amountWei: bigint): string {
  return `${REPAY}${amountWei.toString(16).padStart(64, "0")}`;
}

/**
 * Decide whether to act. Above the floor: nothing. Below: propose the repay that
 * moves the health factor to the configured target — the guard re-checks the
 * post-state against the floor before allowing.
 *
 * @param healthFactorWei current HF from the position read
 * @param debtWei         current debt (wei) from the position read
 * @param collateralWei   current collateral (wei) from the position read
 * @param floorWei        the floor the guard enforces
 * @param targetWei       the HF the keeper restores to
 * @returns repay amount in wei, or null when the position is already above the floor
 */
export function decide(
  healthFactorWei: bigint,
  debtWei: bigint,
  collateralWei: bigint,
  floorWei: bigint,
  targetWei: bigint,
): bigint | null {
  if (healthFactorWei >= floorWei) return null;
  // debt at the target HF: collateral * LTV / target
  const debtAtTarget = ((collateralWei * LTV_BPS) / 10000n) * 1_000_000_000_000_000_000n / targetWei;
  const repay = debtWei > debtAtTarget ? debtWei - debtAtTarget : 0n;
  return repay > 0n ? repay : null;
}

export function buildIntent(
  config: KeeperConfig,
  id: string,
  now: Date,
  repayAmountWei: bigint,
): Intent {
  return {
    id,
    chainId: config.chainId,
    calls: [
      { target: config.target, value: "0", data: repayCalldata(repayAmountWei) },
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
    rationale: `health factor below floor, proposing repay of ${repayAmountWei} to restore ${config.targetWei}`,
    submittedAt: now.toISOString(),
  };
}

/** One loop tick: read, decide, submit (or not). Never throws on a denied intent. */
export async function runOnce(deps: KeeperDeps, config: KeeperConfig, nonce: number): Promise<KeeperOutcome> {
  const { healthFactorWei, collateralWei, debtWei } = await deps.readPosition();
  const action = decide(healthFactorWei, debtWei, collateralWei, config.floorWei, config.targetWei);

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
