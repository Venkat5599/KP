import { PolicyCanvas } from "@/components/canvas/policy-canvas";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Policy",
  description: "Compose the policy document and invariant tuples the gateway and guard consume.",
  path: "/policy",
});

export default function PolicyPage(): ReactNode {
  return (
    <section aria-labelledby="policy-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="policy-heading">
        Policy
      </h1>
      <div className="mt-4">
        <PolicyCanvas />
      </div>
    </section>
  );
}
