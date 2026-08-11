/**
 * RFC 8785 (JSON Canonicalization Scheme) serialization.
 *
 * Receipts are hashed, so two implementations must agree byte-for-byte on the same data.
 * JCS fixes the three things JSON leaves open: property order, number formatting, and
 * string escaping.
 *
 * Deliberately strict. `undefined`, functions, symbols, bigint, and non-finite numbers all
 * throw rather than being coerced, because a silent coercion here becomes a hash mismatch
 * that only surfaces at verification time. uint256 values travel as decimal strings.
 */

export class CanonicalizationError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} (at ${path || "$"})`);
    this.name = "CanonicalizationError";
  }
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number": {
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(`Non-finite number ${String(value)}`, path);
      }
      // JCS mandates ECMAScript Number::toString, which JSON.stringify already emits.
      // Normalize -0 to 0 so it cannot produce a differing digest.
      return JSON.stringify(value === 0 ? 0 : value);
    }

    case "string":
      // JSON.stringify emits the shortest escapes and correct surrogate handling.
      return JSON.stringify(value);

    case "bigint":
      throw new CanonicalizationError(
        "bigint is not serializable; pass uint256 values as decimal strings",
        path,
      );

    case "undefined":
      throw new CanonicalizationError("undefined is not serializable; omit the key instead", path);

    case "function":
    case "symbol":
      throw new CanonicalizationError(`${typeof value} is not serializable`, path);
  }

  if (Array.isArray(value)) {
    const items = value.map((item, i) => serialize(item, `${path}[${i}]`));
    return `[${items.join(",")}]`;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new CanonicalizationError(
      `Only plain objects are serializable, received ${value.constructor?.name ?? "unknown"}`,
      path,
    );
  }

  const record = value as Record<string, unknown>;
  // RFC 8785: sort by UTF-16 code unit, which is the default String comparison in JS.
  const keys = Object.keys(record).sort();
  const members = keys.map((key) => {
    const child = record[key];
    if (child === undefined) {
      throw new CanonicalizationError(`Key "${key}" is undefined; omit it instead`, path);
    }
    return `${JSON.stringify(key)}:${serialize(child, `${path}.${key}`)}`;
  });
  return `{${members.join(",")}}`;
}

/** Canonical JSON text for `value`. Deterministic across implementations. */
export function canonicalize(value: JsonValue): string {
  return serialize(value, "$");
}

/** Canonical JSON as UTF-8 bytes, which is what gets hashed. */
export function canonicalBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
