import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

/**
 * Gateway bootstrap.
 *
 * loadConfig validates every required variable BEFORE the KeeperHub client is
 * constructed, so a misconfigured deployment dies at boot with the exact missing names
 * instead of failing opaquely on the first request.
 */
const config = loadConfig();
const app = buildApp(config);

const port = Number(process.env["PORT"] ?? 3000);

Bun.serve({ port, hostname: "0.0.0.0", fetch: app.fetch });

console.log(
  `noyeet gateway listening on :${port} — policy "${config.policy.name}", guard ${config.guard}`,
);
