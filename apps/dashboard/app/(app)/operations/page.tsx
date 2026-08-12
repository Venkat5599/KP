import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Operations",
  description: "Machine-readable endpoints and health.",
  path: "/operations",
});

export default function OperationsPage(): ReactNode {
  return (
    <section aria-labelledby="ops-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="ops-heading">
        Operations
      </h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {["/api/execute", "/api/probe", "/api/health", "/api/metrics", "/api/transactions", "/api/holds"].map((endpoint) => (
          <a
            key={endpoint}
            href={endpoint}
            className="rounded-full border border-border/70 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-foreground/5"
          >
            {endpoint}
          </a>
        ))}
      </div>
    </section>
  );
}
