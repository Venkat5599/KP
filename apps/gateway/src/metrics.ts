import { Counter, Gauge, Histogram, Registry } from "@noyeet/observability";

/**
 * The gateway's metric surface.
 *
 * Built on the same hand-rolled registry the dashboard uses, so one Prometheus scrape config
 * shape covers both targets and the Grafana board does not need two query dialects.
 *
 * Buckets are chosen from the shape of the work, not from a default ladder: a guard
 * simulation is a network round trip to KeeperHub which is itself a round trip to a node, so
 * the interesting range is hundreds of milliseconds to a few seconds. Buckets below 50ms
 * would only ever record the static-DENY path.
 */

export const registry = new Registry();

export const authorizations = new Counter(
  "noyeet_authorizations_total",
  "Authorization decisions, labelled by verdict and by whether preflight simulation ran.",
);

export const authorizationDuration = new Histogram(
  "noyeet_authorization_duration_seconds",
  "End-to-end authorization latency, from request received to verdict returned.",
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

export const simulationDuration = new Histogram(
  "noyeet_simulation_duration_seconds",
  "Time spent inside the KeeperHub preflight simulation.",
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

export const breakerState = new Gauge(
  "noyeet_breaker_state",
  "Circuit breaker state: 0 closed, 1 half-open, 2 open.",
);

export const upstreamFailures = new Counter(
  "noyeet_upstream_failures_total",
  "Transport-level failures reaching KeeperHub, labelled by error kind.",
);

export const eventsPublished = new Counter(
  "noyeet_events_published_total",
  "Decision events written to the log, labelled by topic and outcome.",
);

export const dependencyUp = new Gauge(
  "noyeet_dependency_up",
  "Readiness of each dependency the gateway needs: 1 up, 0 down.",
);

for (const metric of [
  authorizations,
  authorizationDuration,
  simulationDuration,
  breakerState,
  upstreamFailures,
  eventsPublished,
  dependencyUp,
]) {
  registry.register(metric);
}
