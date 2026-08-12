/**
 * Topic names.
 *
 * Named as constants rather than assembled at the call site: a typo in a topic name does not
 * error, it silently creates a new topic and the messages vanish into it. The compiler cannot
 * catch a mistyped string literal, but it can catch a mistyped property.
 *
 * The version suffix is deliberate. A breaking change to the event shape gets a new topic
 * rather than a mixed one, so a consumer written against v1 can never be handed a v2 record
 * it will misread.
 */

export const TOPICS = {
  /** Every verdict, ALLOW / HOLD / DENY alike. A refusal is the product, not an error. */
  DECISIONS: "noyeet.decisions.v1",
  /** Batches that have been Merkle-rooted and are awaiting or have completed anchoring. */
  ANCHORS: "noyeet.anchors.v1",
  /** Messages that exhausted their retry budget. Never auto-replayed. */
  DEAD_LETTER: "noyeet.dead-letter.v1",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export const ALL_TOPICS: readonly Topic[] = Object.values(TOPICS);
