/**
 * The hold ledger — the human gate. In-process, per-instance (the honest limit of
 * serverless; the gateway's Postgres-backed ledger is the durable version). A HOLD
 * verdict creates a record here; release broadcasts the held composite, cancel
 * resolves it without broadcasting. Nothing is broadcast while held.
 */

export interface HeldIntent {
  readonly intentId: string;
  readonly chainId: number;
  readonly calls: readonly { target: string; value: string; data: string }[];
  readonly invariants: readonly {
    target: string;
    probe: string;
    word: number;
    op: string;
    threshold: string;
  }[];
}

export interface HoldRecord {
  readonly holdId: string;
  readonly intentId: string;
  readonly verdict: "HOLD";
  readonly reasons: readonly { code: string; severity: string; message: string }[];
  readonly digest: string;
  readonly intent: HeldIntent;
  readonly status: "held" | "released" | "cancelled";
  readonly at: string;
  readonly releasedAt?: string;
}

const holds = new Map<string, HoldRecord>();

export function createHold(record: Omit<HoldRecord, "status">): HoldRecord {
  const full: HoldRecord = { ...record, status: "held" };
  holds.set(record.holdId, full);
  return full;
}

export function listHolds(): readonly HoldRecord[] {
  return [...holds.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function getHold(holdId: string): HoldRecord | undefined {
  return holds.get(holdId);
}

export function releaseHold(holdId: string): HoldRecord | null {
  const record = holds.get(holdId);
  if (record === undefined || record.status !== "held") return null;
  const updated: HoldRecord = { ...record, status: "released", releasedAt: new Date().toISOString() };
  holds.set(holdId, updated);
  return updated;
}

export function cancelHold(holdId: string): HoldRecord | null {
  const record = holds.get(holdId);
  if (record === undefined || record.status !== "held") return null;
  const updated: HoldRecord = { ...record, status: "cancelled", releasedAt: new Date().toISOString() };
  holds.set(holdId, updated);
  return updated;
}
