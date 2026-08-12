/**
 * Postgres receipt store (Neon-compatible).
 *
 * Uses the `postgres` driver (porsager/postgres). The table is created on open, so a
 * fresh database works with no migration step; schema changes go through the create
 * statement, which is idempotent.
 *
 * Receipts are stored as a JSONB document plus the columns the dashboard and the
 * anchoring pipeline actually filter on. `digest` is stored as text to keep it
 * comparable with the in-browser verifier output.
 */

import postgres from "postgres";
import type { ReceiptStore, StoredReceipt } from "./index.ts";

export class PostgresStore implements ReceiptStore {
  private readonly sql: postgres.Sql;

  constructor(url: string) {
    if (url === "") throw new Error("PostgresStore requires a non-empty DATABASE_URL");
    this.sql = postgres(url, { max: 5 });
  }

  async ready(): Promise<void> {
    await this.sql`
      create table if not exists noyeet_receipts (
        intent_id   text primary key,
        digest      text not null,
        verdict     text not null,
        chain_id    integer not null,
        guard       text not null,
        at          timestamptz not null,
        document    jsonb not null
      )
    `;
  }

  async put(receipt: StoredReceipt): Promise<StoredReceipt> {
    await this.sql`
      insert into noyeet_receipts (intent_id, digest, verdict, chain_id, guard, at, document)
      values (
        ${receipt.intentId},
        ${receipt.digest},
        ${receipt.verdict},
        ${receipt.chainId},
        ${receipt.guard},
        ${receipt.at},
        ${this.sql.json(JSON.parse(JSON.stringify(receipt)))}
      )
      on conflict (intent_id) do update set
        digest = excluded.digest,
        verdict = excluded.verdict,
        chain_id = excluded.chain_id,
        guard = excluded.guard,
        at = excluded.at,
        document = excluded.document
    `;
    return receipt;
  }

  async list(limit = 50): Promise<readonly StoredReceipt[]> {
    const rows = await this.sql<{ document: StoredReceipt }[]>`
      select document from noyeet_receipts order by at desc limit ${limit}
    `;
    return rows.map((row) => row.document);
  }

  async get(intentId: string): Promise<StoredReceipt | null> {
    const rows = await this.sql<{ document: StoredReceipt }[]>`
      select document from noyeet_receipts where intent_id = ${intentId} limit 1
    `;
    return rows[0]?.document ?? null;
  }

  async count(): Promise<number> {
    const rows = await this.sql<{ n: number }[]>`select count(*)::int as n from noyeet_receipts`;
    return rows[0]?.n ?? 0;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
