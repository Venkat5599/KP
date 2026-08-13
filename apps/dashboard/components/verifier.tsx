"use client";

import { keccak_256 } from "@noble/hashes/sha3";
import { useState } from "react";

/**
 * A real verifier. It performs the same RFC 8785 canonicalization and keccak256 digest
 * as the receipts package, in the browser, with no server involved. Paste a receipt and
 * the digest recomputes from the bytes supplied.
 *
 * Deliberately not a call to an API that returns a verdict. If verification required
 * trusting a server, it would not be verification.
 */

/** RFC 8785 canonicalization: sorted keys, no whitespace, escaped control chars. */
function canonicalize(input: unknown, stack: unknown[] = []): string {
  if (input === null || typeof input !== "object") {
    if (typeof input === "number" && !Number.isFinite(input)) {
      throw new Error("non-finite numbers cannot be canonicalized");
    }
    if (typeof input === "string") {
      return JSON.stringify(input)
        .replace(/[\u0000-\u001f]/g, (ch) => {
          const code = ch.charCodeAt(0);
          return `\\u${code.toString(16).padStart(4, "0")}`;
        })
        .replace(/\\u007f/g, "\\u007f");
    }
    return JSON.stringify(input);
  }

  if (stack.includes(input)) throw new Error("circular reference");
  stack.push(input);

  let output: string;
  if (Array.isArray(input)) {
    output = `[${input.map((item) => canonicalize(item, stack)).join(",")}]`;
  } else {
    const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    output = `{${entries
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalize(value, stack)}`)
      .join(",")}}`;
  }

  stack.pop();
  return output;
}

function toHex(bytes: Uint8Array): string {
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "done"; readonly canonical: string; readonly digest: string };

export function Verifier() {
  const [json, setJson] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const compute = () => {
    try {
      const parsed = JSON.parse(json) as unknown;
      const canonical = canonicalize(parsed);
      const digest = toHex(keccak_256(new TextEncoder().encode(canonical)));
      setState({ kind: "done", canonical, digest });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          setState({ kind: "idle" });
        }}
        spellCheck={false}
        aria-label="Receipt JSON"
        className="h-56 w-full rounded-2xl border border-border bg-background p-4 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
      />

      <button
        type="button"
        onClick={compute}
        className="inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85"
      >
        Compute digest
      </button>

      {state.kind === "error" ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 font-mono text-xs text-red-500">
          {state.message}
        </p>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Digest
            </p>
            <code className="block break-all rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 font-mono text-sm text-emerald-600">
              {state.digest}
            </code>
          </div>
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Canonical form
            </p>
            <code className="block break-all rounded-xl border border-border bg-background p-4 font-mono text-xs">
              {state.canonical}
            </code>
          </div>
        </div>
      ) : null}
    </div>
  );
}
