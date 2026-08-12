/**
 * In-memory receipt store.
 *
 * Correct and dependency-free; loses everything on restart, which is why it is the
 * fallback and never the recommended production configuration.
 */

import type { Receipt } from "@noyeet/receipts";
import type { ReceiptStore, StoredReceipt } from "./index.ts";

export class MemoryStore implements ReceiptStore {
  private readonly receipts = new Map<string, StoredReceipt>();
  private readonly order: string[] = [];

  async put(receipt: StoredReceipt): Promise<StoredReceipt> {
    if (!this.receipts.has(receipt.intentId)) this.order.push(receipt.intentId);
    this.receipts.set(receipt.intentId, receipt);
    return receipt;
  }

  async list(limit = 50): Promise<readonly StoredReceipt[]> {
    return [...this.order]
      .reverse()
      .slice(0, limit)
      .map((id) => this.receipts.get(id)!);
  }

  async get(intentId: string): Promise<StoredReceipt | null> {
    return this.receipts.get(intentId) ?? null;
  }

  async count(): Promise<number> {
    return this.receipts.size;
  }
}

/** Convenience alias so callers can open a store without knowing the concrete type. */
export function memoryStore(): MemoryStore {
  return new MemoryStore();
}

export type { Receipt };
