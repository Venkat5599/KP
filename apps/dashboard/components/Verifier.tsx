"use client";

import { keccak_256 } from "@noble/hashes/sha3";
import { useState } from "react";

/**
 * A real verifier. It performs the same RFC 8785 canonicalization and keccak256 digest as
 * the receipts package, in the browser, with no server involved. Paste a receipt and the
 * digest recomputes from the bytes supplied.
 *
 * Deliberately not a call to an API that returns a verdict. If verification required
 * trusting a server, it would not be verification.
 */

function canonicalize(value: unknown, path = "$"): string {
  if (value === null) return "null";

  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
    return JSON.stringify(value === 0 ? 0 : value);
  }

  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalize(item, `${path}[${i}]`)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => {
      const child = record[key];
      if (child === undefined) throw new Error(`Key "${key}" is undefined at ${path}`);
      return `${JSON.stringify(key)}:${canonicalize(child, `${path}.${key}`)}`;
    });
    return `{${members.join(",")}}`;
  }

  throw new Error(`${typeof value} is not serializable at ${path}`);
}

function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const SAMPLE = JSON.stringify(
  {
    intentId: "int_01J8ZQ4T7K",
    intentHash: "0x9f2b1c",
    policyHash: "0xab3f77",
    guard: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",
    chainId: 11155111,
    verdict: "DENY",
    reasons: [
      {
        code: "INVARIANT_BROKEN",
        severity: "deny",
        message:
          "Invariant 0 would break: got 1120000000000000000, required 1400000000000000000.",
      },
    ],
    simulation: { wouldRevert: true, gasEstimate: "0", invariantIndex: 0 },
    execution: null,
    at: "2026-08-11T14:02:12Z",
  },
  null,
  2,
);

type Result =
  | { readonly state: "idle" }
  | { readonly state: "error"; readonly message: string }
  | { readonly state: "ok"; readonly digest: string; readonly canonical: string };

export function Verifier() {
  const [input, setInput] = useState(SAMPLE);
  const [result, setResult] = useState<Result>({ state: "idle" });

  function verify() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      setResult({ state: "error", message: `That is not valid JSON. ${(error as Error).message}` });
      return;
    }

    try {
      const canonical = canonicalize(parsed);
      const digest = toHex(keccak_256(new TextEncoder().encode(canonical)));
      setResult({ state: "ok", digest, canonical });
    } catch (error) {
      setResult({ state: "error", message: (error as Error).message });
    }
  }

  return (
    <div className="verifier">
      <label className="verifier-label" htmlFor="receipt">
        Receipt JSON
      </label>
      <textarea
        id="receipt"
        className="verifier-input"
        value={input}
        spellCheck={false}
        rows={14}
        onChange={(event) => {
          setInput(event.target.value);
          setResult({ state: "idle" });
        }}
      />

      <button className="verifier-action" type="button" onClick={verify}>
        Compute digest
      </button>

      {result.state === "error" ? (
        <p className="verifier-error" role="alert">
          {result.message}
        </p>
      ) : null}

      {result.state === "ok" ? (
        <div className="verifier-out">
          <div className="verifier-row">
            <span className="verifier-key">Digest</span>
            <code className="verifier-digest">{result.digest}</code>
          </div>
          <div className="verifier-row">
            <span className="verifier-key">Canonical form</span>
            <code className="verifier-canonical">{result.canonical}</code>
          </div>
          <p className="verifier-note">
            Key order in the input does not affect this digest. Reorder the fields and
            recompute: the value is identical, which is what lets two independent
            implementations agree on the same receipt.
          </p>
        </div>
      ) : null}
    </div>
  );
}
