import { createMetadata } from "@/lib/metadata";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Operations",
  description: "Observability: Prometheus, Kafka event log, OpenTelemetry, endpoints.",
  path: "/operations",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Every row is a fact from configuration or a live check. Nothing is invented. */
export default async function OperationsPage(): Promise<ReactNode> {
  const kafkaEnabled = process.env["KAFKA_ENABLED"] === "true";
  const kafkaBrokers = process.env["KAFKA_BROKERS"] ?? "";
  const otlpEnabled = process.env["OTEL_ENABLED"] === "true";
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] ?? "";

  const rows: readonly { label: string; value: string; detail: string; ok: boolean; href?: string }[] = [
    {
      label: "Prometheus — this site",
      value: "/api/metrics",
      detail: "every scrape reads the guard, the executor registration and the anchored batches from the chain — nothing simulated",
      ok: true,
      href: "/api/metrics",
    },
    {
      label: "Gateway",
      value: "live on this deployment",
      detail:
        "this deployment serves the gateway surface: /v1/authorize, /v1/execute, /v1/holds (+ release/cancel), /v1/verify, /v1/executions/:id, /healthz, /readyz. The hold ledger is in-process (serverless instances do not share memory); the Postgres-backed store is the durable version when DATABASE_URL is set",
      ok: true,
      href: "/healthz",
    },
    {
      label: "Kafka event log",
      value: kafkaEnabled ? (kafkaBrokers === "" ? "enabled, brokers unset" : kafkaBrokers) : "not enabled",
      detail: kafkaEnabled
        ? "gateway publishes every decision to the TOPICS.DECISIONS topic — kafkajs producer, acks=-1, keyed by intentId, RFC 8785 payloads"
        : "set KAFKA_ENABLED=true and KAFKA_BROKERS=host:port on a long-lived gateway process; the serverless deployment does not run the producer (infra/observability has the full stack)",
      ok: kafkaEnabled,
    },
    {
      label: "OpenTelemetry",
      value: otlpEnabled ? (otlpEndpoint === "" ? "enabled, endpoint unset" : otlpEndpoint) : "not enabled",
      detail: otlpEnabled
        ? "gateway traces carry a traceparent on every decision event"
        : "set OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_TRACES_ENDPOINT on a long-lived gateway process; the serverless deployment does not run the exporter",
      ok: otlpEnabled,
    },
    {
      label: "Health",
      value: "/api/health",
      detail: "probe, guard, store and gateway status as JSON, all read at request time",
      ok: true,
      href: "/api/health",
    },
  ];

  return (
    <section aria-labelledby="ops-heading">
      <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-muted-foreground" id="ops-heading">
        Operations
      </h1>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
        <table className="w-full text-left">
          <thead className="border-b border-border/70 bg-foreground/[0.03]">
            <tr>
              <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">System</th>
              <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="hidden px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={row.label} className="transition-colors hover:bg-foreground/[0.02]">
                <td className="px-5 py-4">
                  <p className="font-mono text-xs">{row.label}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${row.ok ? "bg-emerald-500" : "bg-red-500"}`}
                      aria-hidden="true"
                    />
                    {row.href !== undefined ? (
                      <a
                        href={row.href}
                        className="inline-flex items-center gap-1 font-mono text-xs text-accent underline underline-offset-2"
                      >
                        {row.value}
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="font-mono text-xs">{row.value}</span>
                    )}
                  </span>
                </td>
                <td className="hidden px-5 py-4 font-mono text-[11px] text-muted-foreground sm:table-cell">
                  {row.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {["/api/execute", "/api/health", "/api/metrics", "/api/transactions", "/api/holds", "/readyz", "/healthz"].map((endpoint) => (
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
