/**
 * Vendored from packages/observability.
 *
 * The dashboard deploys to Vercel as a standalone directory, so a `workspace:*` dependency
 * cannot resolve at build time. Rather than reshape the deployment around one import, the
 * two source files are copied here verbatim. `packages/observability` remains the source of
 * truth and carries the tests; a change there must be copied across.
 */
export { Counter, Gauge, Histogram, Registry, type Labels } from "./registry";
export { collectMetrics, type CollectOptions, type CollectResult } from "./collect";
