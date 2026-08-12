import { Kafka, Partitioners, type Producer as KafkaProducer, logLevel } from "kafkajs";
import { TOPICS, type Topic } from "./topics.ts";
import type { DecisionEvent, NoyeetEvent } from "./schema.ts";

/**
 * The decision producer.
 *
 * Two choices worth stating.
 *
 * **Keyed by intentId.** Kafka guarantees order within a partition, and the key picks the
 * partition. Keying on the intent means every event about one intent is ordered relative to
 * the others; nothing needs global order, and forcing it would mean one partition and a hard
 * throughput ceiling for a guarantee nobody uses.
 *
 * **acks: -1 (all in-sync replicas).** A decision receipt is the evidence a refusal happened.
 * Acknowledging on the leader alone would let a leader failover lose a receipt, and a receipt
 * absent from the anchored root is indistinguishable from one that never existed. Durability
 * beats latency here; the whole point of the record is that it survives.
 */

export interface ProducerOptions {
  readonly brokers: readonly string[];
  readonly clientId?: string;
  /** Fail fast on an unreachable broker rather than hanging the first request. */
  readonly connectionTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
}

export interface EventProducer {
  connect(): Promise<void>;
  emitDecision(event: DecisionEvent): Promise<void>;
  emit(topic: Topic, key: string, event: NoyeetEvent): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
}

export function encodeEvent(event: NoyeetEvent): Buffer {
  return Buffer.from(JSON.stringify(event), "utf8");
}

export function createProducer(options: ProducerOptions): EventProducer {
  const kafka = new Kafka({
    clientId: options.clientId ?? "noyeet-gateway",
    brokers: [...options.brokers],
    connectionTimeout: options.connectionTimeoutMs ?? 3_000,
    requestTimeout: options.requestTimeoutMs ?? 10_000,
    // kafkajs logs at INFO by default and is extremely chatty about partition leadership.
    logLevel: logLevel.WARN,
    // No `retries` cap. An idempotent producer needs an effectively unbounded retry budget:
    // capping it lets a send give up mid-sequence, and kafkajs then warns that exactly-once
    // delivery no longer holds. Bounding the wait (via maxRetryTime) is the right knob, and
    // the caller already has its own timeout above this.
    retry: { initialRetryTime: 200, maxRetryTime: 5_000 },
  });

  // The legacy partitioner is the murmur2 one every other Kafka client uses. The default in
  // kafkajs v2 changed, which silently splits a keyed stream across partitions differently
  // from any other producer writing the same topic.
  const producer: KafkaProducer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
    idempotent: true,
    maxInFlightRequests: 1,
  });

  let connected = false;

  return {
    get connected() {
      return connected;
    },

    async connect() {
      if (connected) return;
      await producer.connect();
      connected = true;
    },

    async emit(topic, key, event) {
      await producer.send({
        topic,
        acks: -1,
        messages: [{ key, value: encodeEvent(event) }],
      });
    },

    async emitDecision(event) {
      await this.emit(TOPICS.DECISIONS, event.intentId, event);
    },

    async disconnect() {
      if (!connected) return;
      await producer.disconnect();
      connected = false;
    },
  };
}

/**
 * Known interaction, recorded so the next person does not chase it.
 *
 * Under Bun, kafkajs emits `TimeoutNegativeWarning` from its internal request queue on
 * connect. It comes from kafkajs computing a timer delay against a clock Bun reports
 * differently, is emitted once, and does not affect delivery — messages produce and consume
 * correctly, verified end to end against Redpanda. It is noise from a dependency, not a bug
 * in this code, and is left unsuppressed rather than swallowed with a global warning filter
 * that would also hide real ones.
 */
export const KNOWN_BUN_KAFKAJS_WARNING = "TimeoutNegativeWarning";
