import { describe, expect, test } from "bun:test";
import { canonicalize, CanonicalizationError } from "../src/canonical.ts";

describe("RFC 8785 canonicalization", () => {
  test("sorts object keys by UTF-16 code unit", () => {
    expect(canonicalize({ b: 1, a: 2, C: 3 })).toBe('{"C":3,"a":2,"b":1}');
  });

  test("key order in the source does not change the output", () => {
    expect(canonicalize({ z: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalize({ a: { c: 3, d: 2 }, z: 1 }),
    );
  });

  test("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  test("emits no insignificant whitespace", () => {
    expect(canonicalize({ a: [1, { b: 2 }] })).toBe('{"a":[1,{"b":2}]}');
  });

  test("normalizes negative zero", () => {
    expect(canonicalize({ v: -0 })).toBe('{"v":0}');
  });

  test("escapes quotes and control characters", () => {
    const quote = String.fromCharCode(34);
    const newline = String.fromCharCode(10);
    const tab = String.fromCharCode(9);
    const input = `a${quote}b${newline}${tab}`;
    // Canonical output must carry escape sequences, never raw control bytes.
    expect(canonicalize({ s: input })).toBe(String.raw`{"s":"a\"b\n\t"}`);
  });

  test("handles astral-plane characters", () => {
    expect(canonicalize({ s: "\u{1F512}" })).toBe('{"s":"\u{1F512}"}');
  });

  test("rejects bigint, pointing at decimal strings", () => {
    expect(() => canonicalize({ v: 1n } as never)).toThrow(CanonicalizationError);
  });

  test("rejects undefined rather than dropping the key", () => {
    expect(() => canonicalize({ v: undefined } as never)).toThrow(CanonicalizationError);
  });

  test("rejects NaN and Infinity", () => {
    expect(() => canonicalize({ v: Number.NaN } as never)).toThrow(CanonicalizationError);
    expect(() => canonicalize({ v: Number.POSITIVE_INFINITY } as never)).toThrow(
      CanonicalizationError,
    );
  });

  test("rejects non-plain objects", () => {
    expect(() => canonicalize({ d: new Date() } as never)).toThrow(CanonicalizationError);
  });

  test("error names the offending path", () => {
    try {
      canonicalize({ a: { b: [1, Number.NaN] } } as never);
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as CanonicalizationError).path).toBe("$.a.b[1]");
    }
  });
});
