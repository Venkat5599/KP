/**
 * The HOLD ledger.
 *
 * A HOLD is a decision that escalated to a human. This in-memory ledger tracks the
 * record through its lifecycle — held, released, cancelled — and is the state a
 * dashboard or operator polls while the human decides. In-memory on purpose: the
 * ledger answers "what is waiting right now", and the receipts (the durable record)
 * live in the store.
 */

import type { Intent } from "@noyeet/policy";
import type { Receipt } from "@noyeet/receipts";

export type HoldStatus = "held" | "released" | "cancelled";

export interface HoldRecord {
  readonly holdId: string;
  readonly intent: Intent;
  readonly idempotencyKey: string;
  readonly receipt: Receipt;
  readonly digest: string;
  readonly status: HoldStatus;
  readonly at: string;
  readonly resolvedAt: string | null;
}

export class HoldLedger {
  private readonly records = new Map<string, HoldRecord>();

  constructor(private readonly newId: () => string = defaultHoldId) {}

  create(
    intent: Intent,
    idempotencyKey: string,
    receipt: Receipt,
    digest: string,
  ): HoldRecord {
    const record: HoldRecord = {
      holdId: this.newId(),
      intent,
      idempotencyKey,
      receipt,
      digest,
      status: "held",
      at: new Date().toISOString(),
      resolvedAt: null,
    };
    this.records.set(record.holdId, record);
    return record;
  }

  get(holdId: string): HoldRecord | null {
    return this.records.get(holdId) ?? null;
  }

  list(): readonly HoldRecord[] {
    return [...this.records.values()];
  }

  /** Returns null when the hold does not exist or is already resolved. */
  resolve(holdId: string, status: "released" | "cancelled"): HoldRecord | null {
    const record = this.records.get(holdId);
    if (record === undefined || record.status !== "held") return null;
    const resolved: HoldRecord = {
      ...record,
      status,
      resolvedAt: new Date().toISOString(),
    };
    this.records.set(holdId, resolved);
    return resolved;
  }
}

function defaultHoldId(): string {
  return `hold_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
