import { loadConfig } from "@/lib/env";
import { formatHealthFactor } from "@/lib/format";
import { readGuardConfig } from "@/lib/live";
import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Guard",
  description: "The deployed guard's configuration, read live from the chain.",
  path: "/guard",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuardPage(): Promise<ReactNode> {
  const config = loadConfig();
  const chainFacts = await readGuardConfig(config);

  const facts: readonly { label: string; value: string; source: "chain" | "env" }[] = [
    ...(config.guardAddress === ""
      ? []
      : [{ label: "Guard", value: config.guardAddress, source: "env" as const }]),
    ...(config.targetAddress === ""
      ? []
      : [{ label: "Target", value: config.targetAddress, source: "env" as const }]),
    ...(config.executorAddress === ""
      ? []
      : [{ label: "Executor (configured)", value: config.executorAddress, source: "env" as const }]),
    ...(config.chainName === "" ? [] : [{ label: "Chain", value: config.chainName, source: "env" as const }]),
    ...(config.healthFactorFloor === ""
      ? []
      : [{ label: "HF floor", value: formatHealthFactor(config.healthFactorFloor), source: "env" as const }]),
    ...chainFacts.map((fact) => ({ label: fact.label, value: fact.value, source: "chain" as const })),
  ];

  return (
    <section aria-labelledby="guard-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="guard-heading">
        Guard
      </h1>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
        <table className="w-full text-left">
          <thead className="border-b border-border/70 bg-foreground/[0.03]">
            <tr>
              <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Field</th>
              <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Value</th>
              <th className="hidden px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {facts.map((fact) => (
              <tr key={`${fact.source}-${fact.label}`} className="transition-colors hover:bg-foreground/[0.02]">
                <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{fact.label}</td>
                <td className="px-5 py-3.5">
                  {fact.source === "env" && config.explorer !== "" ? (
                    <a
                      href={`${config.explorer}/address/${fact.value}`}
                      className="break-all font-mono text-xs text-accent underline underline-offset-2"
                    >
                      {fact.value}
                    </a>
                  ) : (
                    <span className="break-all font-mono text-xs">{fact.value}</span>
                  )}
                </td>
                <td className="hidden px-5 py-3.5 text-right sm:table-cell">
                  <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {fact.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
