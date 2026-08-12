import { Kafka, logLevel, type Consumer as KafkaConsumer } from "kafkajs";
import { TOPICS, type Topic } from "./topics.ts";
import { decodeEvent } from "./validate.ts";
import { encodeEvent, type EventProducer } from "./producer.ts";
import { EVENT_VERSION, type DeadLetterEvent, type NoyeetEvent } from "./schema.ts";

/**
 * A consumer with an explicit poison-message policy.
 *
 * The default behaviour of every Kafka client is to retry a failing message forever, which
 * blocks the partition. One malformed record then halts every well-formed record behind it,
 * and the outage looks like a stall rather than an error. That is the single most common way
 * a consumer group dies quietly.
 *
 * So: bounded in-process retries, then the record goes to the dead-letter topic with its
 * original bytes intact and the offset is committed so the partition moves on. Nothing is
 * auto-replayed out of the DLQ — a human decides, because a poison message that was replayed
 * automatically is just a slower infinite loop.
 */

export interface ConsumerOptions {
  readonly brokers: readonly string[];
  readonly groupId: string;
  readonly topics: readonly Topic[];
  readonly clientId?: string;
  /** In-process attempts before a record is dead-lettered. */
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  /** Producer used to write the DLQ. Injected so the consumer owns no connection it did not open. */
  readonly deadLetterProducer: EventProducer;
  readonly onError?: (error: Error, context: Record<string, string>) => void;
}

export type MessageHandler = (event: NoyeetEvent, meta: MessageMeta) => Promise<void>;

export interface MessageMeta {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: string | null;
}

export interface EventConsumer {
  run(handler: MessageHandler): Promise<void>;
  disconnect(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createConsumer(options: ConsumerOptions): EventConsumer {
  const kafka = new Kafka({
    clientId: options.clientId ?? "noyeet-anchor",
    brokers: [...options.brokers],
    connectionTimeout: 3_000,
    logLevel: logLevel.WARN,
  });

  const consumer: KafkaConsumer = kafka.consumer({
    groupId: options.groupId,
    // A long session timeout papers over a wedged handler; a short one rebalances during a
    // slow batch. 30s is above the anchor batch flush and below a human noticing a stall.
    sessionTimeout: 30_000,
  });

  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;

  async function deadLetter(
    meta: MessageMeta,
    raw: Uint8Array | null,
    attempts: number,
    error: Error,
  ): Promise<void> {
    const event: DeadLetterEvent = {
      v: EVENT_VERSION,
      type: "dead-letter",
      sourceTopic: meta.topic,
      partition: meta.partition,
      offset: meta.offset,
      attempts,
      error: error.message,
      payloadBase64: raw === null ? "" : Buffer.from(raw).toString("base64"),
      at: new Date().toISOString(),
    };

    try {
      await options.deadLetterProducer.emit(TOPICS.DEAD_LETTER, meta.offset, event);
    } catch (cause) {
      // The DLQ write itself failed. Committing anyway would lose the record entirely, but
      // refusing to commit wedges the partition — the exact failure this class exists to
      // prevent. Surface it loudly and move on: an alert beats a silent stall.
      options.onError?.(cause as Error, {
        stage: "dead-letter-write",
        topic: meta.topic,
        offset: meta.offset,
      });
    }
  }

  return {
    async run(handler) {
      await consumer.connect();
      for (const topic of options.topics) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const meta: MessageMeta = {
            topic,
            partition,
            offset: message.offset,
            key: message.key === null ? null : message.key.toString("utf8"),
          };

          const raw = message.value;
          const decoded = decodeEvent(raw);

          // A record that does not parse will never parse. Retrying it is pure latency.
          if (!decoded.ok) {
            await deadLetter(meta, raw, 1, decoded.error);
            return;
          }

          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              await handler(decoded.value, meta);
              return;
            } catch (cause) {
              lastError = cause as Error;
              options.onError?.(lastError, {
                stage: "handler",
                topic,
                offset: meta.offset,
                attempt: String(attempt),
              });
              if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
            }
          }

          await deadLetter(meta, raw, maxAttempts, lastError ?? new Error("handler failed"));
        },
      });
    },

    async disconnect() {
      await consumer.disconnect();
    },
  };
}

export { encodeEvent };
