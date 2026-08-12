import { NextResponse } from "next/server";
import { listTransactions } from "../../../lib/transactions";

export const dynamic = "force-dynamic";

/** The transaction list. See lib/transactions.ts. */
export async function GET(): Promise<Response> {
  return NextResponse.json(await listTransactions());
}
