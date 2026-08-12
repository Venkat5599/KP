import { createProducer, type EventProducer } from "@noyeet/events";
import { initTelemetry, shutdownTelemetry } from "@noyeet/telemetry";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

/**
 * Gateway bootstrap.
 *
 * loadConfig validates every required variable BEFORE the KeeperHub client is
 * constructed, so a misconfigured deployment dies at boot with the exact missing names
 * instead of failing opaquely on the first request.
 *
 * Telemetry and the event log are both optional and both degrade quietly. Neither is
 * allowed to stop the gateway from answering: a tracing outage or a broker outage must
 * never become an authorization outage. The event log being down does show up on
 * /readyz, so a load balancer can route around it, but the process still decides.
 */

function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ level, message, ...fields, at: new Date().toISOString() })}\n`,
  );
}

const config = loadConfig();

initTelemetry({
  serviceName: "noyeet-gateway",
  serviceVersion: config.serviceVersion,
  endpoint: config.otlp.endpoint,
  enabled: config.otlp.enabled,
});

let producer: EventProducer | null = null;
if (config.kafka.enabled) {
  producer = createProducer({ brokers: config.kafka.brokers, clientId: "noyeet-gateway" });
  try {
    await producer.connect();
    log("info", "connected to the event log", { brokers: config.kafka.brokers.join(",") });
  } catch (error) {
    // Degraded, not dead. Verdicts still happen; they are simply not durable on the log
    // yet, and /readyz reports exactly that rather than pretending otherwise.
    log("error", "event log unreachable at boot, running degraded", {
      error: (error as Error).message,
    });
  }
}

const app = buildApp(config, producer);
const port = Number(process.env["PORT"] ?? 3000);

const server = Bun.serve({ port, hostname: "0.0.0.0", fetch: app.fetch });

log("info", "gateway listening", {
  port,
  policy: config.policy.name,
  guard: config.guard,
  eventLog: producer === null ? "disabled" : "enabled",
  tracing: config.otlp.enabled ? "enabled" : "disabled",
});

const shutdown = async (signal: string): Promise<void> => {
  log("info", "shutting down", { signal });
  await server.stop();
  await producer?.disconnect().catch(() => undefined);
  await shutdownTelemetry((error) =>
    log("warn", "trace flush failed on shutdown", { error: error.message }),
  );
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
