/**
 * Receipt storage for noyeet.
 *
 * A decision that was not persisted did not happen: the receipt is the evidence a third
 * party can check later, so losing it to a process restart is data loss, not a cache
 * miss. The default store is in-memory (correct, fast, dies with the process); when
 * DATABASE_URL is present a Postgres store is used instead and survives restarts.
 *
 * Postgres is the only persistent backend on purpose. The plan names Neon; any Postgres
 * works, and there is deliberately no second persistence technology to babysit.
 */

import type { Receipt } from "@noyeet/receipts";
import type { AnchorInfo } from "@noyeet/receipts";
import { MemoryStore } from "./memory.ts";
import { PostgresStore } from "./postgres.ts";

export interface StoredReceipt extends Receipt {
  readonly digest: string;
  /** Anchor material added after the digest is computed; never part of the hashed document. */
  readonly anchor?: AnchorInfo;
}

export interface ReceiptStore {
  /** Persist a receipt. Returns the same receipt, for chaining. */
  put(receipt: StoredReceipt): Promise<StoredReceipt>;
  /** Most recent first. */
  list(limit?: number): Promise<readonly StoredReceipt[]>;
  get(intentId: string): Promise<StoredReceipt | null>;
  count(): Promise<number>;
}

export function openStore(env: Record<string, string | undefined> = process.env): ReceiptStore {
  const url = env["DATABASE_URL"];
  if (url !== undefined && url !== "") {
    return new PostgresStore(url);
  }
  return new MemoryStore();
}

export { MemoryStore } from "./memory.ts";
export { PostgresStore } from "./postgres.ts";
