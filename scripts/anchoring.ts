/**
 * Batch receipt anchoring.
 *
 * Reads unanchored receipts from the store, groups them into deterministic UTC-hour
 * batches, builds a sorted Merkle tree over their digests, and commits each root to the
 * AnchorStore through KeeperHub's direct execution API under an idempotency key derived
 * from the batch id — so re-runs and retries can never double-anchor.
 *
 * Requires (fail-fast, named):
 *   KEEPERHUB_API_KEY    — org key (the wallet that signs must be the AnchorStore admin)
 *   ANCHOR_ADDRESS       — deployed AnchorStore
 *   ANCHOR_CHAIN_ID      — e.g. 11155111 for Sepolia
 *   DATABASE_URL         — receipts must survive restart to be anchorable; the memory
 *                          store is empty on every boot, so with no database the script
 *                          correctly finds nothing to anchor and exits.
 *
 * Run: bun run anchor
 */

import { KeeperHubClient } from "@noyeet/keeperhub";
import { batchIdFor, buildAnchorBatch, type Hex } from "@noyeet/receipts";
import { openStore, type StoredReceipt } from "@noyeet/store";

const REQUIRED = ["KEEPERHUB_API_KEY", "ANCHOR_ADDRESS", "ANCHOR_CHAIN_ID", "DATABASE_URL"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`missing env: ${name}`);
  }
  return value;
}

/** The exact AnchorStore.anchor(uint256,bytes32,bytes32) ABI, as KeeperHub expects it. */
const ANCHOR_ABI = JSON.stringify([
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "root", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
    ],
    outputs: [{ name: "blockNumber", type: "uint256" }],
  },
]);

function groupByBatch(receipts: readonly StoredReceipt[]): Map<number, StoredReceipt[]> {
  const groups = new Map<number, StoredReceipt[]>();
  for (const receipt of receipts) {
    const batchId = batchIdFor(receipt.at);
    const existing = groups.get(batchId);
    if (existing === undefined) groups.set(batchId, [receipt]);
    else existing.push(receipt);
  }
  return groups;
}

/**
 * A batch must be a single policy epoch: every member carries the same policy hash,
 * so the anchored batch records which policy was in force. Mixed-policy batches are
 * a configuration error and must not be anchored silently.
 */
function policyHashOf(members: readonly StoredReceipt[]): Hex {
  const hashes = new Set(members.map((receipt) => receipt.policyHash.toLowerCase()));
  if (hashes.size !== 1) {
    throw new Error(
      `batch spans ${hashes.size} policy hashes (${[...hashes].slice(0, 3).join(", ")}...) — refusing to anchor`,
    );
  }
  return [...hashes][0] as Hex;
}

async function main(): Promise<void> {
  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(", ")}`);
  }

  const client = new KeeperHubClient({ apiKey: requireEnv("KEEPERHUB_API_KEY") });
  const store = openStore();
  const anchorAddress = requireEnv("ANCHOR_ADDRESS") as Hex;
  const chainId = Number(requireEnv("ANCHOR_CHAIN_ID"));

  const receipts = await store.list(50_000);
  const unanchored = receipts.filter((receipt) => receipt.anchor === undefined);

  if (unanchored.length === 0) {
    console.log(`nothing to anchor: ${receipts.length} receipts stored, all anchored`);
    return;
  }

  const batches = groupByBatch(unanchored);
  let anchored = 0;

  for (const [batchId, members] of [...batches.entries()].sort(([a], [b]) => a - b)) {
    const digests = members.map((receipt) => receipt.digest as Hex);
    const batch = buildAnchorBatch(batchId, digests);
    const policyHash = policyHashOf(members);

    const accepted = await client.executeContractCall(
      {
        chainId,
        contractAddress: anchorAddress,
        functionName: "anchor",
        abi: ANCHOR_ABI,
        functionArgs: JSON.stringify([batchId, batch.root, policyHash]),
      },
      `noyeet-anchor-${batchId}`,
    );

    for (const receipt of members) {
      const entry = batch.entries.get(receipt.digest.toLowerCase());
      if (entry === undefined) throw new Error(`digest ${receipt.digest} missing from batch tree`);
      await store.put({
        ...receipt,
        anchor: {
          batchId,
          root: batch.root,
          policyHash,
          leafIndex: entry.leafIndex,
          proof: entry.proof,
          executionId: accepted.executionId,
          transactionHash: accepted.transactionHash,
        },
      });
    }

    anchored += members.length;
    console.log(
      `anchored batch ${batchId}: ${members.length} receipts, root ${batch.root}, ` +
        `policy ${policyHash}, execution ${accepted.executionId}` +
        `${accepted.transactionHash ? ` (${accepted.transactionHash})` : " (tx pending)"}`,
    );
  }

  console.log(`done: ${anchored} receipts anchored across ${batches.size} batch(es)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
