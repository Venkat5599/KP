/**
 * Live health status for the status strip and the /api/health route. Every field is
 * a fact read at request time; a false field carries its reason. No field is guessed.
 * The probe result is passed in so a page view runs the KeeperHub simulations once.
 */

import { loadConfig } from "./env";
import { guardReachable } from "./live";
import type { ProbePayload } from "./probe";
import { openStore } from "@noyeet/store";

export interface HealthPayload {
  readonly at: string;
  readonly probe: { live: boolean; reason?: string };
  readonly guard: { reachable: boolean; configured: boolean };
  readonly store: { configured: boolean; receipts: number | null };
  readonly gateway: { configured: boolean };
}

export async function computeHealth(probe: ProbePayload): Promise<HealthPayload> {
  const config = loadConfig();
  const [guardOk, storeCount] = await Promise.all([
    guardReachable(config.guardAddress),
    readStoreCount(),
  ]);

  return {
    at: new Date().toISOString(),
    probe: {
      live: probe.live,
      reason: probe.live ? undefined : (probe.reason ?? "no live simulation ran"),
    },
    guard: {
      reachable: guardOk,
      configured: config.guardAddress !== "",
    },
    store: {
      configured: process.env["DATABASE_URL"] !== undefined && process.env["DATABASE_URL"] !== "",
      receipts: storeCount,
    },
    gateway: {
      configured: config.gatewayUrl !== null,
    },
  };
}

async function readStoreCount(): Promise<number | null> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") return null;
  try {
    const store = openStore();
    return (await store.list(1)).length;
  } catch {
    return null;
  }
}
