import http from "http";

import { log } from "./logger";
import type { AssetState } from "./types";

/**
 * Minimal health/observability server. No external deps — just Node's http.
 *
 *   GET /health   → 200 if the keeper ticked recently, 503 if stalled.
 *   GET /status   → full per-asset phase snapshot (JSON).
 *
 * Designed so an external supervisor (pm2, Docker healthcheck, k8s probe,
 * uptime monitor) can detect a hung keeper and restart it.
 */

interface HealthState {
  bootedAt: number;
  lastTickAt: number;
  lastError: string | null;
  states: AssetState[];
}

const STALL_THRESHOLD_MS = Number(process.env.KEEPER_STALL_MS ?? "120000"); // 2 min

export function startHealthServer(getState: () => HealthState): http.Server | null {
  const port = Number(process.env.KEEPER_HEALTH_PORT ?? "0");
  if (!port) {
    log.info("health.disabled", { hint: "set KEEPER_HEALTH_PORT to enable" });
    return null;
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const s = getState();
    const now = Date.now();
    const sinceTick = now - s.lastTickAt;
    const healthy = sinceTick < STALL_THRESHOLD_MS;

    if (url.startsWith("/health")) {
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: healthy,
          uptimeSec: Math.floor((now - s.bootedAt) / 1000),
          sinceLastTickMs: sinceTick,
          lastError: s.lastError
        })
      );
      return;
    }

    if (url.startsWith("/status")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          {
            ok: healthy,
            bootedAt: s.bootedAt,
            lastTickAt: s.lastTickAt,
            sinceLastTickMs: sinceTick,
            assets: s.states.map((a) => ({
              key: a.key,
              index: a.index,
              cadence: a.cadence,
              phase: a.phase,
              lastError: a.lastError,
              cooldownUntil: a.cooldownUntil,
              status: a.snapshot?.status ?? null,
              deadline: a.snapshot?.deadline ?? null,
              round: a.snapshot ? a.snapshot.currentRoundId.toString() : null
            }))
          },
          null,
          2
        )
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found", routes: ["/health", "/status"] }));
  });

  server.listen(port, () => {
    log.info("health.listening", { port, stallThresholdMs: STALL_THRESHOLD_MS });
  });

  server.on("error", (err) => {
    log.error("health.serverError", { err: err instanceof Error ? err.message : String(err) });
  });

  return server;
}
