/**
 * Thin re-export so the API routes import from within the app instead of reaching into
 * a sibling package. The implementation lives in @noyeet/observability.
 */
export { collectMetrics } from "@noyeet/observability";
