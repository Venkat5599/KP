import { loadConfig } from "@/lib/env";
import { formatTime } from "@/lib/format";
import { runProbe } from "@/lib/probe";
import { createMetadata } from "@/lib/metadata";
import { CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Overview",
  description: "Live status of the noyeet guard at a glance.",
  path: "/overview",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OverviewPage(): Promise<ReactNode> {
  const config = loadConfig();
  const probe = await runProbe();

  const decisions =
    probe.results?.map((result) => ({
      verdict: result.verdict,
      resultingHealthFactor: result.resultingHealthFactor,
    })) ?? [];

  const allowed = decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = decisions.filter((d) => d.verdict === "DENY").length;
  const probeLive = probe.live && decisions.length > 0;

  const stats: readonly { label: string; value: string; sub: string; ok?: boolean }[] = [
    {
      label: "Verdicts (this read)",
      value: probeLive ? String(decisions.length) : "—",
      sub: formatTime(probe.at) + " UTC",
      ok: probeLive,
    },
    { label: "Allowed", value: String(allowed), sub: "would-broadcast", ok: allowed > 0 },
    { label: "Refused", value: String(refused), sub: refused > 0 ? "reverts before existing" : "nothing refused" },
    {
      label: "Guard",
      value: config.guardAddress === "" ? "unset" : `${config.guardAddress.slice(0, 8)}…`,
      sub: probe.live ? "simulating" : (probe.reason ?? "not live"),
      ok: probeLive,
    },
  ];

  return (
    <section aria-labelledby="overview-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="overview-heading">
        Overview
      </h1>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border/70 bg-background/60 p-5">
            <p className="font-mono text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              {stat.ok !== undefined ? (
                stat.ok ? (
                  <CircleCheck className="size-3 text-emerald-500" aria-hidden="true" />
                ) : (
                  <CircleX className="size-3 text-red-500" aria-hidden="true" />
                )
              ) : null}
              {stat.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
