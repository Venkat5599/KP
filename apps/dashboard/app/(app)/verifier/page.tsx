import { Verifier } from "@/components/verifier";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Verifier",
  description: "Recompute a receipt digest in the browser.",
  path: "/verifier",
});

export default function VerifierPage(): ReactNode {
  return (
    <section aria-labelledby="verify-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="verify-heading">
        Verifier
      </h1>
      <div className="mt-4">
        <Verifier />
      </div>
    </section>
  );
}
