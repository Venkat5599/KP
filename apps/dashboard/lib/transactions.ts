/**
 * The transaction list, shared by the /api/transactions route and the page.
 * Receipts from the store (when DATABASE_URL is configured) merged with the seed
 * transactions configured for this deployment. Nothing is invented: an empty list
 * is an honest empty list.
 */

import { loadConfig } from "./env";
import { openStore } from "@noyeet/store";

export interface TransactionView {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly hash: string | null;
  readonly executionId: string | null;
}

export interface TransactionsPayload {
  readonly at: string;
  readonly storeConfigured: boolean;
  readonly transactions: readonly TransactionView[];
}

export async function listTransactions(): Promise<TransactionsPayload> {
  const config = loadConfig();

  const storeConfigured =
    process.env["DATABASE_URL"] !== undefined && process.env["DATABASE_URL"] !== "";
  let stored: TransactionView[] = [];
  if (storeConfigured) {
    try {
      const store = openStore();
      const receipts = await store.list(200);
      stored = receipts.map((receipt) => ({
        id: receipt.intentId,
        label: receipt.verdict === "ALLOW" ? "Allowed decision" : `${receipt.verdict} decision`,
        detail: `${receipt.verdict} on chain ${receipt.chainId} at ${receipt.at}`,
        hash: receipt.anchor?.transactionHash ?? null,
        executionId: receipt.anchor?.executionId ?? null,
      }));
    } catch {
      stored = [];
    }
  }

  const seeds: TransactionView[] = config.seedTransactions.map((seed) => ({
    id: seed.hash,
    label: seed.label,
    detail: seed.detail,
    hash: seed.hash,
    executionId: seed.executionId ?? null,
  }));

  return {
    at: new Date().toISOString(),
    storeConfigured,
    transactions: [...stored, ...seeds],
  };
}
