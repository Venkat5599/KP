import { describe, expect, test } from "bun:test";
import { MemoryStore } from "../src/memory.ts";
import { openStore } from "../src/index.ts";
import { PostgresStore } from "../src/postgres.ts";
import type { StoredReceipt } from "../src/index.ts";

const receipt = (intentId: string, verdict: StoredReceipt["verdict"] = "ALLOW"): StoredReceipt => ({
  intentId,
  intentHash: "0x" + "aa".repeat(32) as `0x${string}`,
  policyHash: "0x" + "bb".repeat(32) as `0x${string}`,
  guard: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as `0x${string}`,
  chainId: 11155111,
  verdict,
  reasons: [],
  simulation: null,
  execution: null,
  at: "2026-08-12T06:00:00Z",
  digest: "0x" + "cc".repeat(32) as `0x${string}`,
});

describe("MemoryStore", () => {
  test("round-trips a receipt", async () => {
    const store = new MemoryStore();
    await store.put(receipt("int_1"));
    expect(await store.get("int_1")).toMatchObject({ intentId: "int_1" });
    expect(await store.count()).toBe(1);
  });

  test("lists most recent first", async () => {
    const store = new MemoryStore();
    await store.put(receipt("int_1"));
    await store.put(receipt("int_2"));
    const all = await store.list();
    expect(all.map((r) => r.intentId)).toEqual(["int_2", "int_1"]);
  });

  test("upserts by intent id without duplicating", async () => {
    const store = new MemoryStore();
    await store.put(receipt("int_1"));
    await store.put(receipt("int_1", "DENY"));
    expect(await store.count()).toBe(1);
    expect((await store.get("int_1"))?.verdict).toBe("DENY");
  });

  test("missing receipt returns null", async () => {
    const store = new MemoryStore();
    expect(await store.get("nope")).toBeNull();
  });
});

describe("openStore", () => {
  test("memory store when DATABASE_URL is absent", () => {
    const store = openStore({});
    expect(store).toBeInstanceOf(MemoryStore);
  });

  test("postgres store when DATABASE_URL is present", () => {
    const store = openStore({ DATABASE_URL: "postgres://user:pass@example.invalid/db" });
    expect(store).toBeInstanceOf(PostgresStore);
  });
});

describe("PostgresStore", () => {
  test("rejects an empty url", () => {
    expect(() => new PostgresStore("")).toThrow("non-empty DATABASE_URL");
  });

  test("rejects a url without a scheme", () => {
    expect(() => new PostgresStore("not-a-url")).toThrow();
  });
});
