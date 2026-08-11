import { keccak_256 } from "@noble/hashes/sha3";
import { canonicalBytes, type JsonValue } from "./canonical.ts";

export type Hex = `0x${string}`;

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array): Hex {
  let out = "";
  for (const byte of bytes) out += HEX[byte >> 4]! + HEX[byte & 15]!;
  return `0x${out}`;
}

export function fromHex(hex: Hex): Uint8Array {
  const body = hex.slice(2);
  if (body.length % 2 !== 0) throw new Error(`Odd-length hex: ${hex}`);
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`Invalid hex: ${hex}`);
    out[i] = byte;
  }
  return out;
}

export function keccak(bytes: Uint8Array): Uint8Array {
  return keccak_256(bytes);
}

/** keccak256 over the RFC 8785 canonical form. This is the receipt digest. */
export function hashJson(value: JsonValue): Hex {
  return toHex(keccak(canonicalBytes(value)));
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Lexicographic byte comparison. Returns negative, zero, or positive. */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}
