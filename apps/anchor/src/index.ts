import {
  createConsumer,
  createProducer,
  decodeEvent,
  EVENT_VERSION,
  TOPICS,
  type AnchorEvent,
  type DecisionEvent,
  type MessageMeta,
  type NoyeetEvent,
} from "@noyeet/events";
import { buildTree, type Hex } from "@noyeet/receipts";
import { Counter, Gauge, Registry } from "@noyeet/observability";

/**
 * The anchoring consumer.
 *
 * It reads decision digests off the log, batches them, and Merkle-roots each batch so the
 * root can be committed on chain. A receipt absent from an anchored root did not exist, so
 * the correctness property that matters is: no decision that was published is left out of a
 * root.
 *
 * That property drives the flush rule. A batch flushes on whichever comes first, a size
 * threshold or an age threshold. Size alone would leave the last few receipts of a quiet
 * period unanchored indefinitely, which is precisely when an operator most wants proof that
 * nothing happened. Age alone would produce a root per receipt under load.
 *
 * Ordering within the tree is arrival order, and arrival order is stable per intent because
 * the producer keys on `intentId`. The leaf index is therefore reproducible from the log.
 */

export interface AnchorOptions {
  readonly brokers: readonly string[];
  readonly groupId: string;
  readonly batchSize: number;
  readonly maxBatchAgeMs: number;
}

export const registry = new Registry();

export const receiptsSeen = new Counter(
  "noyeet_anchor_receipts_total",
  "Decision receipts consumed from the log, labelled by verdict.",
);
export const batchesFlushed = new Counter(
  "noyeet_anchor_batches_total",
  "Merkle batches sealed and published to the anchors topic.",
);
export const pendingLeaves = new Gauge(
  "noyeet_anchor_pending_leaves",
  "Receipts accumulated in the open batch, not yet rooted.",
);
for (const m of [receiptsSeen, batchesFlushed, pendingLeaves]) registry.register(m);

function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ level, message, ...fields, at: new Date().toISOString() })}\n`,
  );
}

/**
 * Batch state, extracted so it is testable without a broker.
 *
 * `seal` returns null on an empty batch rather than throwing: a timer firing during a quiet
 * period is normal, and building a Merkle tree with zero leaves is undefined.
 */
export class ReceiptBatch {
  private leaves: Hex[] = [];
  private openedAt: number;

  constructor(
    private readonly batchSize: number,
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.openedAt = this.now();
  }

  get size(): number {
    return this.leaves.length;
  }

  add(digest: Hex): void {
    if (this.leaves.length === 0) this.openedAt = this.now();
    this.leaves.push(digest);
  }

  shouldFlush(): boolean {
    if (this.leaves.length === 0) return false;
    return this.leaves.length >= this.batchSize || this.now() - this.openedAt >= this.maxAgeMs;
  }

  seal(): { root: Hex; leaves: readonly Hex[] } | null {
    if (this.leaves.length === 0) return null;
    const leaves = this.leaves;
    this.leaves = [];
    this.openedAt = this.now();
    return { root: buildTree(leaves).root, leaves };
  }
}

function isDecision(event: NoyeetEvent): event is DecisionEvent {
  return event.type === "decision";
}

export async function main(): Promise<void> {
  const options: AnchorOptions = {
    brokers: (process.env["KAFKA_BROKERS"] ?? "localhost:19092").split(",").map((b) => b.trim()),
    groupId: process.env["ANCHOR_GROUP_ID"] ?? "noyeet-anchor",
    batchSize: Number(process.env["ANCHOR_BATCH_SIZE"] ?? 8),
    maxBatchAgeMs: Number(process.env["ANCHOR_MAX_BATCH_AGE_MS"] ?? 15_000),
  };

  const producer = createProducer({ brokers: options.brokers, clientId: "noyeet-anchor" });
  await producer.connect();

  const batch = new ReceiptBatch(options.batchSize, options.maxBatchAgeMs);

  async function flush(reason: string): Promise<void> {
    const sealed = batch.seal();
    if (sealed === null) return;

    const event: AnchorEvent = {
      v: EVENT_VERSION,
      type: "anchor",
      root: sealed.root,
      leaves: sealed.leaves,
      at: new Date().toISOString(),
    };

    await producer.emit(TOPICS.ANCHORS, sealed.root, event);
    batchesFlushed.inc({ reason });
    pendingLeaves.set(batch.size);
    log("info", "batch sealed", { root: sealed.root, leaves: sealed.leaves.length, reason });
  }

  const consumer = createConsumer({
    brokers: options.brokers,
    groupId: options.groupId,
    topics: [TOPICS.DECISIONS],
    deadLetterProducer: producer,
    onError: (error, ctx) => log("error", "consumer error", { ...ctx, error: error.message }),
  });

  // The age-based flush needs its own timer; a consumer with no traffic never wakes up.
  const timer = setInterval(() => {
    if (batch.shouldFlush()) void flush("age").catch((e) => log("error", "flush failed", { error: (e as Error).message }));
  }, 1_000);

  await consumer.run(async (event: NoyeetEvent, meta: MessageMeta) => {
    if (!isDecision(event)) return;

    receiptsSeen.inc({ verdict: event.verdict });
    batch.add(event.digest);
    pendingLeaves.set(batch.size);
    log("info", "receipt consumed", {
      intentId: event.intentId,
      verdict: event.verdict,
      digest: event.digest,
      offset: meta.offset,
    });

    if (batch.shouldFlush()) await flush("size");
  });

  const shutdown = async (signal: string): Promise<void> => {
    log("info", "shutting down", { signal });
    clearInterval(timer);
    // Seal what is in hand before leaving, or those receipts are anchored by nobody.
    await flush("shutdown").catch(() => undefined);
    await consumer.disconnect().catch(() => undefined);
    await producer.disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log("info", "anchor consumer running", {
    brokers: options.brokers.join(","),
    batchSize: options.batchSize,
    maxBatchAgeMs: options.maxBatchAgeMs,
  });
}

export { decodeEvent };

if (import.meta.main) await main();
