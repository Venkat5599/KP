import { ExecutePanel } from "@/components/execute-panel";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Execute",
  description: "Run an intent through the noyeet pipeline: policy, simulation, broadcast.",
  path: "/",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The dapp's purpose: submit an intent, get a real verdict and broadcast. */
export default function ExecutePage(): ReactNode {
  return (
    <section aria-labelledby="execute-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="execute-heading">
        Execute
      </h1>
      <div className="mt-4">
        <ExecutePanel />
      </div>
    </section>
  );
}
