/**
 * The hold queue, shared by the /api/holds route and the page. Backed by the
 * in-process hold ledger (lib/holds-ledger.ts): the gateway surface lives on this
 * deployment at /v1/holds, and the ledger is the same module both read, so the
 * page and the API can never disagree within an instance.
 *
 * The ledger is per-instance memory — the honest limit of serverless. The
 * gateway's Postgres-backed store is the durable version for a long-lived run.
 */

import { listHolds as ledgerList } from "./holds-ledger";

export interface HoldsPayload {
  readonly configured: boolean;
  readonly holds: readonly unknown[];
  readonly reason: string | null;
}

export async function listHolds(): Promise<HoldsPayload> {
  const holds = ledgerList();
  return { configured: true, holds, reason: null };
}
