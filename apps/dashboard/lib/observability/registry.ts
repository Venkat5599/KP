/**
 * A Prometheus registry with no dependencies.
 *
 * Written by hand rather than pulled from `prom-client` for one reason: this has to run on
 * Vercel's serverless and edge runtimes without a native build step, and the exposition
 * format is a few hundred lines of well-specified text.
 * See https://prometheus.io/docs/instrumenting/exposition_formats/
 *
 * Every metric here is fed by a real observation. There is no synthetic series.
 */

export type Labels = Readonly<Record<string, string>>;

/** Label values may not contain a raw newline, quote, or backslash. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const rendered = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",");
  return `{${rendered}}`;
}

/** Stable key for a label set, so repeated observations land on the same series. */
function seriesKey(labels: Labels): string {
  return renderLabels(labels);
}

abstract class Metric {
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  abstract get type(): string;
  protected abstract samples(): readonly string[];

  render(): string {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
      ...this.samples(),
    ].join("\n");
  }
}

export class Counter extends Metric {
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  override get type(): string {
    return "counter";
  }

  inc(labels: Labels = {}, amount = 1): void {
    if (amount < 0) throw new RangeError("A counter may only increase");
    const key = seriesKey(labels);
    const current = this.values.get(key);
    if (current) current.value += amount;
    else this.values.set(key, { labels, value: amount });
  }

  get(labels: Labels = {}): number {
    return this.values.get(seriesKey(labels))?.value ?? 0;
  }

  protected samples(): readonly string[] {
    if (this.values.size === 0) return [`${this.name} 0`];
    return [...this.values.values()].map(
      ({ labels, value }) => `${this.name}${renderLabels(labels)} ${value}`,
    );
  }
}

export class Gauge extends Metric {
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  override get type(): string {
    return "gauge";
  }

  set(value: number, labels: Labels = {}): void {
    this.values.set(seriesKey(labels), { labels, value });
  }

  get(labels: Labels = {}): number | undefined {
    return this.values.get(seriesKey(labels))?.value;
  }

  protected samples(): readonly string[] {
    return [...this.values.values()].map(
      ({ labels, value }) => `${this.name}${renderLabels(labels)} ${value}`,
    );
  }
}

interface HistogramSeries {
  readonly labels: Labels;
  readonly counts: number[];
  sum: number;
  count: number;
}

export class Histogram extends Metric {
  readonly buckets: readonly number[];
  private readonly series = new Map<string, HistogramSeries>();

  constructor(name: string, help: string, buckets: readonly number[]) {
    super(name, help);
    const sorted = [...buckets].sort((a, b) => a - b);
    if (sorted.some((bound, i) => i > 0 && bound === sorted[i - 1])) {
      throw new Error(`Histogram ${name} has duplicate bucket bounds`);
    }
    this.buckets = sorted;
  }

  override get type(): string {
    return "histogram";
  }

  observe(value: number, labels: Labels = {}): void {
    const key = seriesKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    // Buckets are cumulative: an observation lands in its own bucket and every wider one.
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) entry.counts[i] = (entry.counts[i] ?? 0) + 1;
    }
    entry.sum += value;
    entry.count += 1;
  }

  protected samples(): readonly string[] {
    const lines: string[] = [];
    for (const entry of this.series.values()) {
      this.buckets.forEach((bound, i) => {
        lines.push(
          `${this.name}_bucket${renderLabels({ ...entry.labels, le: String(bound) })} ${
            entry.counts[i] ?? 0
          }`,
        );
      });
      lines.push(
        `${this.name}_bucket${renderLabels({ ...entry.labels, le: "+Inf" })} ${entry.count}`,
      );
      lines.push(`${this.name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
      lines.push(`${this.name}_count${renderLabels(entry.labels)} ${entry.count}`);
    }
    return lines;
  }
}

export class Registry {
  static readonly CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

  private readonly metrics: Metric[] = [];

  register<T extends Metric>(metric: T): T {
    if (this.metrics.some((existing) => existing.name === metric.name)) {
      throw new Error(`Metric ${metric.name} is already registered`);
    }
    this.metrics.push(metric);
    return metric;
  }

  counter(name: string, help: string): Counter {
    return this.register(new Counter(name, help));
  }

  gauge(name: string, help: string): Gauge {
    return this.register(new Gauge(name, help));
  }

  histogram(name: string, help: string, buckets: readonly number[]): Histogram {
    return this.register(new Histogram(name, help, buckets));
  }

  /** Prometheus text exposition format. The trailing newline is required. */
  render(): string {
    return `${this.metrics.map((metric) => metric.render()).join("\n\n")}\n`;
  }
}
