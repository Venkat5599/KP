import { describe, expect, test } from "bun:test";
import { Counter, Gauge, Histogram, Registry, collectMetrics } from "../src/index.ts";

describe("exposition format", () => {
  test("a counter with no observations still exposes zero", () => {
    const registry = new Registry();
    registry.counter("noyeet_requests_total", "Requests.");
    expect(registry.render()).toBe(
      "# HELP noyeet_requests_total Requests.\n# TYPE noyeet_requests_total counter\nnoyeet_requests_total 0\n",
    );
  });

  test("labels are sorted so a series key is stable across call sites", () => {
    const counter = new Counter("m", "help");
    counter.inc({ verdict: "DENY", chain: "sepolia" });
    counter.inc({ chain: "sepolia", verdict: "DENY" });
    expect(counter.render()).toContain('m{chain="sepolia",verdict="DENY"} 2');
  });

  test("label values are escaped", () => {
    const counter = new Counter("m", "help");
    const input = `a${String.fromCharCode(34)}b\\c${String.fromCharCode(10)}d`;
    counter.inc({ reason: input });
    expect(counter.render()).toContain(String.raw`m{reason="a\"b\\c\nd"} 1`);
  });

  test("a counter refuses to decrease", () => {
    expect(() => new Counter("m", "h").inc({}, -1)).toThrow(RangeError);
  });

  test("a gauge overwrites rather than accumulates", () => {
    const gauge = new Gauge("g", "help");
    gauge.set(5, { outcome: "permitted" });
    gauge.set(9, { outcome: "permitted" });
    expect(gauge.get({ outcome: "permitted" })).toBe(9);
  });

  test("duplicate metric names are rejected", () => {
    const registry = new Registry();
    registry.counter("dup", "first");
    expect(() => registry.counter("dup", "second")).toThrow();
  });
});

describe("histogram", () => {
  test("buckets are cumulative and carry an +Inf bucket", () => {
    const histogram = new Histogram("h", "help", [1, 2, 5]);
    histogram.observe(0.5);
    histogram.observe(1.5);
    histogram.observe(9);

    const rendered = histogram.render();
    expect(rendered).toContain('h_bucket{le="1"} 1');
    expect(rendered).toContain('h_bucket{le="2"} 2');
    expect(rendered).toContain('h_bucket{le="5"} 2');
    expect(rendered).toContain('h_bucket{le="+Inf"} 3');
    expect(rendered).toContain("h_sum 11");
    expect(rendered).toContain("h_count 3");
  });

  test("bucket bounds are sorted regardless of input order", () => {
    expect(new Histogram("h", "help", [5, 1, 2]).buckets).toEqual([1, 2, 5]);
  });

  test("duplicate bounds are rejected", () => {
    expect(() => new Histogram("h", "help", [1, 1])).toThrow();
  });
});

/**
 * The collector is driven with scripted HTTP responses copied verbatim from the live
 * KeeperHub API. That is a transport seam, not a fabricated metric: the point is to assert
 * that a real response shape produces the right series.
 */
function scriptedFetch(responses: Record<string, { status: number; body: unknown }>) {
  return (async (input: string | URL | Request) => {
    const url = input.toString();
    const key = Object.keys(responses).find((path) => url.includes(path));
    const entry = key ? responses[key]! : { status: 404, body: {} };
    return { status: entry.status, json: async () => entry.body } as Response;
  }) as unknown as typeof fetch;
}

const OPTIONS = {
  apiKey: "kh_test",
  baseUrl: "https://app.keeperhub.com",
  chainId: 11155111,
  guard: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",
  target: "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B",
  floorWei: "1400000000000000000",
};

describe("collection", () => {
  test("a working guard reports healthy and records the denial reason", async () => {
    let call = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      if (input.toString().includes("/api/user")) {
        return { status: 200, json: async () => ({}) } as Response;
      }
      call += 1;
      const permitted = call === 1;
      const body = permitted
        ? { wouldRevert: false, gasEstimate: "52667" }
        : {
            wouldRevert: true,
            failureKind: "revert",
            revertReason: "Error(NOYEET/1:INV:0:1120000000000000000:1400000000000000000)",
          };
      return { status: permitted ? 200 : 400, json: async () => body } as Response;
    }) as unknown as typeof fetch;

    const { body, contentType } = await collectMetrics({ ...OPTIONS, fetchImpl });

    expect(contentType).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(body).toContain("noyeet_guard_healthy 1");
    expect(body).toContain("noyeet_keeperhub_authenticated 1");
    expect(body).toContain('noyeet_denial_reasons_total{code="INVARIANT_BROKEN",index="0"} 1');
    expect(body).toContain('noyeet_invariant_margin_wei{index="0"} 280000000000000000');
    expect(body).toContain("noyeet_simulation_duration_seconds_count");
  });

  /** A guard that refuses everything is broken, and one check would score it as healthy. */
  test("a guard that refuses the safe intent is not healthy", async () => {
    const fetchImpl = scriptedFetch({
      "/api/execute/contract-call": {
        status: 400,
        body: { wouldRevert: true, failureKind: "revert", revertReason: "NOYEET/1:REENTRANT" },
      },
      "/api/user": { status: 200, body: {} },
    });

    const { body } = await collectMetrics({ ...OPTIONS, fetchImpl });
    expect(body).toContain("noyeet_guard_healthy 0");
  });

  test("a preflight rejection is not recorded as an invariant breach", async () => {
    const fetchImpl = scriptedFetch({
      "/api/execute/contract-call": {
        status: 400,
        body: {
          wouldRevert: true,
          failureKind: "validation",
          code: "insufficient_balance",
          revertReason: "Insufficient BASE balance. Have: 0.0, Need: 0.0001.",
        },
      },
      "/api/user": { status: 200, body: {} },
    });

    const { body } = await collectMetrics({ ...OPTIONS, fetchImpl });
    expect(body).toContain('noyeet_denial_reasons_total{code="PREFLIGHT_REJECTED"}');
    expect(body).not.toContain("INVARIANT_BROKEN");
  });

  test("a bad key surfaces as an explicit zero, not a missing series", async () => {
    const fetchImpl = scriptedFetch({
      "/api/execute/contract-call": { status: 200, body: { wouldRevert: false } },
      "/api/user": { status: 401, body: { error: "Unauthorized" } },
    });

    const { body } = await collectMetrics({ ...OPTIONS, fetchImpl });
    expect(body).toContain("noyeet_keeperhub_authenticated 0");
    expect(body).toContain('noyeet_upstream_failures_total{kind="unauthorized"} 1');
  });

  test("a network failure is recorded rather than swallowed", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;

    const { body } = await collectMetrics({ ...OPTIONS, fetchImpl });
    expect(body).toContain('noyeet_upstream_failures_total{kind="network"}');
    expect(body).toContain("noyeet_guard_healthy 0");
  });
});
