/**
 * The hold queue, shared by the /api/holds route and the page. Proxied live from
 * the gateway (NOYEET_GATEWAY_URL). When no gateway is configured the payload says
 * so; the page renders the honest empty state instead of a fabricated queue.
 */

import { loadConfig } from "./env";

export interface HoldsPayload {
  readonly configured: boolean;
  readonly holds: readonly unknown[];
  readonly reason: string | null;
}

export async function listHolds(): Promise<HoldsPayload> {
  const config = loadConfig();

  if (config.gatewayUrl === null) {
    return { configured: false, holds: [], reason: "NOYEET_GATEWAY_URL is not set" };
  }

  try {
    const response = await fetch(`${config.gatewayUrl}/v1/holds`, { cache: "no-store" });
    if (!response.ok) {
      return { configured: true, holds: [], reason: `gateway returned HTTP ${response.status}` };
    }
    const holds = (await response.json()) as unknown;
    return { configured: true, holds: Array.isArray(holds) ? holds : [], reason: null };
  } catch (error) {
    return { configured: true, holds: [], reason: `gateway unreachable: ${(error as Error).message}` };
  }
}
