/** Formatting helpers. Pure functions, no state, no literals that matter. */

/** 0x1234…abcd with configurable head/tail length. */
export function shorten(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Wei -> "1.40"-style display, 2 decimals, 18-decimal units. */
export function formatHealthFactor(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = ((value % 1_000_000_000_000_000_000n) / 10_000_000_000_000_000n)
    .toString()
    .padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** ISO timestamp -> HH:MM:SS UTC. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(11, 19);
}
