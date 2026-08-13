import { describe, expect, test } from "bun:test";
import {
  buildIntent,
  decide,
  probeCalldata,
  repayCalldata,
  runOnce,
  type Intent,
  type PositionRead,
} from "../src/core.ts";

const GUARD = "0x94FB7677358c44BB0617029a3162108Ae3aa557a" as const;
const TARGET = "0xE1Ee5dB5Cf1f07ef9e1E361A09d5d9A6BEBe8FeE" as const;
const FLOOR = 1_400_000_000_000_000_000n;
const TARGET_HF = 1_500_000_000_000_000_000n;
// collateral 100 ETH @ LTV 75% → debt at HF 1.5 is 50 ETH
const COLLATERAL = 100_000_000_000_000_000_000n;
const DEBT_AT_TARGET = 50_000_000_000_000_000_000n;

const config = {
  chainId: 11155111,
  target: TARGET,
  guard: GUARD,
  floorWei: FLOOR,
  targetWei: TARGET_HF,
  idPrefix: "keeper",
};

const position = (debtWei: bigint, hfWei: bigint): PositionRead => ({
  collateralWei: COLLATERAL,
  debtWei,
  healthFactorWei: hfWei,
});

describe("decide", () => {
  test("no action above the floor", () => {
    expect(decide(1_600_000_000_000_000_000n, DEBT_AT_TARGET, COLLATERAL, FLOOR, TARGET_HF)).toBeNull();
  });

  test("no action exactly at the floor", () => {
    expect(decide(FLOOR, DEBT_AT_TARGET, COLLATERAL, FLOOR, TARGET_HF)).toBeNull();
  });

  test("below the floor: proposes the repay that restores the target HF", () => {
    // debt 55 ETH → HF 1.3636 < floor; restoring HF 1.5 needs debt 50 ETH → repay 5 ETH
    const repay = decide(1_363_636_363_636_363_636n, 55_000_000_000_000_000_000n, COLLATERAL, FLOOR, TARGET_HF);
    expect(repay).toBe(5_000_000_000_000_000_000n);
  });

  test("never proposes a negative repay", () => {
    // pathological: debt already at/under the target — nothing to repay
    expect(decide(1_300_000_000_000_000_000n, DEBT_AT_TARGET, COLLATERAL, FLOOR, TARGET_HF)).toBeNull();
  });
});

describe("calldata", () => {
  test("repay encodes the amount as a uint256", () => {
    const calldata = repayCalldata(5_000_000_000_000_000_000n);
    expect(calldata.startsWith("0x371fd8e6")).toBe(true);
    expect(calldata).toHaveLength(10 + 64);
  });

  test("probe targets the guard address", () => {
    const probe = probeCalldata(GUARD);
    expect(probe.startsWith("0xbf92857c")).toBe(true);
    expect(probe.slice(-40)).toBe(GUARD.slice(2).toLowerCase());
  });
});

describe("buildIntent", () => {
  test("declares the floor as the invariant threshold and repays", () => {
    const intent = buildIntent(config, "keeper-1", new Date("2026-08-12T06:00:00Z"), 5_000_000_000_000_000_000n);
    expect(intent.calls[0]?.target).toBe(TARGET);
    expect(intent.calls[0]?.data).toBe(repayCalldata(5_000_000_000_000_000_000n));
    expect(intent.invariants[0]?.threshold).toBe(FLOOR.toString());
    expect(intent.invariants[0]?.op).toBe("GTE");
  });
});

describe("runOnce", () => {
  test("healthy position: no submission", async () => {
    let submitted = 0;
    const outcome = await runOnce(
      {
        readPosition: async () => position(DEBT_AT_TARGET, 1_500_000_000_000_000_000n),
        submit: async (intent: Intent) => {
          submitted++;
          return "submitted";
        },
        now: () => new Date("2026-08-12T06:00:00Z"),
      },
      config,
      0,
    );
    expect(outcome.kind).toBe("noop");
    expect(submitted).toBe(0);
  });

  test("below floor: submits a guard-wrapped repay intent", async () => {
    const captured: Intent[] = [];
    const outcome = await runOnce(
      {
        readPosition: async () => position(55_000_000_000_000_000_000n, 1_363_636_363_636_363_636n),
        submit: async (intent: Intent) => {
          captured.push(intent);
          return "submitted";
        },
        now: () => new Date("2026-08-12T06:00:00Z"),
      },
      config,
      7,
    );
    expect(outcome.kind).toBe("submitted");
    expect(captured[0]?.id).toBe("keeper-7");
    expect(captured[0]?.calls[0]?.data).toBe(repayCalldata(5_000_000_000_000_000_000n));
  });

  test("held intents are surfaced, not retried", async () => {
    const outcome = await runOnce(
      {
        readPosition: async () => position(55_000_000_000_000_000_000n, 1_363_636_363_636_363_636n),
        submit: async () => "held",
        now: () => new Date(),
      },
      config,
      1,
    );
    expect(outcome.kind).toBe("held");
  });

  test("denied intents are surfaced, not retried", async () => {
    const outcome = await runOnce(
      {
        readPosition: async () => position(55_000_000_000_000_000_000n, 1_363_636_363_636_363_636n),
        submit: async () => "denied",
        now: () => new Date(),
      },
      config,
      1,
    );
    expect(outcome.kind).toBe("denied");
  });
});
