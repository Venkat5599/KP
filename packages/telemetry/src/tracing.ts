import { context, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

/**
 * Tracing bootstrap.
 *
 * `NodeTracerProvider` explicitly, not `NodeSDK` with auto-instrumentation. Auto-instrumentation
 * monkey-patches `http`, `net`, and friends at require time, which under Bun patches modules that
 * are shimmed rather than real. Manual spans around the three boundaries that matter — policy
 * evaluation, the KeeperHub call, receipt digest — produce a trace that is both smaller and
 * actually correct, and the boundaries are already named in the code.
 *
 * Nothing here throws on a missing collector. The exporter buffers and drops; a tracing outage
 * must never become an authorization outage.
 */

export interface TelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  /** OTLP HTTP endpoint, e.g. http://localhost:4318/v1/traces */
  readonly endpoint: string;
  readonly enabled?: boolean;
}

let provider: NodeTracerProvider | null = null;

export function initTelemetry(options: TelemetryOptions): Tracer {
  if (options.enabled === false) return trace.getTracer(options.serviceName);
  if (provider !== null) return trace.getTracer(options.serviceName);

  provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
    }),
  });

  // Batch, not simple: one HTTP round trip per span would put the exporter on the
  // authorization hot path, which is the opposite of what tracing is for.
  provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: options.endpoint })));
  provider.register();
  return trace.getTracer(options.serviceName);
}

/**
 * Flush and stop.
 *
 * The try/catch is not defensive padding. Verified under Bun: when no collector is
 * listening, the OTLP HTTP exporter's final flush rejects from inside `node:_http_client`
 * and takes the process down during shutdown. A tracing backend being absent must never
 * become a service failure, so the flush error is swallowed and reported, never rethrown.
 */
export async function shutdownTelemetry(
  onError?: (error: Error) => void,
): Promise<void> {
  if (provider === null) return;
  const current = provider;
  provider = null;
  try {
    await current.shutdown();
  } catch (error) {
    onError?.(error as Error);
  }
}

/**
 * Run `fn` inside a span, recording exceptions and setting error status.
 *
 * The span is ended in `finally`, so a throw cannot leak an unended span — an unended span is
 * invisible in every backend, which means the one trace an operator most needs is the one that
 * silently does not appear.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: Readonly<Record<string, string | number | boolean>>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn(span));
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * W3C traceparent for the active span, so a Kafka record links back to the trace that produced
 * it. Formatted by hand rather than pulled through the propagator API: the payload is one field
 * on an event, and a full `inject` round trip would carry baggage that has no reader.
 */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (span === undefined) return undefined;
  const ctx = span.spanContext();
  if (ctx.traceId === "" || ctx.spanId === "") return undefined;
  const flags = (ctx.traceFlags & 0xff).toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

export { SpanStatusCode, trace, type Span, type Tracer };
