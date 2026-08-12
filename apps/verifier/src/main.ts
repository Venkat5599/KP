/**
 * Browser entry for the static receipt verifier.
 *
 * Deliberately tiny: canonicalize (RFC 8785) + keccak256, exactly the receipts package
 * pipeline, bundled to a single ESM file with zero runtime dependencies beyond the
 * bundle itself. No server, no network, no framework — open index.html from disk and
 * it works, which is the point: verification that requires trusting a server is not
 * verification.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { canonicalize } from "@noyeet/receipts";

function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export interface DigestResult {
  readonly digest: string;
  readonly canonical: string;
}

/** Compute the receipt digest from a JSON document. Throws on invalid input. */
export function computeDigest(receiptJson: string): DigestResult {
  const parsed = JSON.parse(receiptJson) as unknown;
  const canonical = canonicalize(parsed as never);
  const digest = toHex(keccak_256(new TextEncoder().encode(canonical)));
  return { digest, canonical };
}

function render() {
  const input = document.getElementById("receipt") as HTMLTextAreaElement | null;
  const output = document.getElementById("output") as HTMLDivElement | null;
  const claimed = document.getElementById("claimed") as HTMLInputElement | null;
  if (input === null || output === null || claimed === null) return;

  try {
    const { digest, canonical } = computeDigest(input.value);
    const expected = claimed.value.trim();
    const matches =
      expected === "" ? null : expected.toLowerCase() === digest.toLowerCase();

    output.innerHTML = [
      `<p class="row"><span class="key">Digest</span><code class="mono">${digest}</code></p>`,
      `<p class="row"><span class="key">Canonical form</span><code class="mono">${canonical}</code></p>`,
      matches === null
        ? ""
        : `<p class="row"><span class="key">Claimed digest</span><code class="mono">${
            matches ? "MATCH" : "MISMATCH"
          }</code></p>`,
    ].join("");
  } catch (error) {
    output.innerHTML = `<p class="row"><span class="key">Error</span><code class="mono">${
      error instanceof Error ? error.message : String(error)
    }</code></p>`;
  }
}

// The module is importable outside a DOM (tests, bundlers) — the page wiring only
// runs in a browser.
if (typeof document !== "undefined") {
  const button = document.getElementById("verify");
  if (button !== null) button.addEventListener("click", render);
}
