/**
 * ZeroSight keeper bot — single-process state machine.
 *
 *  - All on-chain ops via centralised nonce manager (no nonce collisions).
 *  - Per-asset state machine; assets ticked sequentially each loop to avoid
 *    over-pressuring the RPC and to keep tx ordering deterministic.
 *  - Block-timestamp scheduling in UTC (no local TZ surprises).
 *  - RPC failover via FallbackProvider (set STORY_RPC_FALLBACKS).
 *  - Health/observability server (set KEEPER_HEALTH_PORT) for supervisors.
 *  - Structured JSON-line logs in non-TTY (production-friendly), pretty in TTY.
 */
import { ASSETS } from "./keeper/types";
import type { AssetState } from "./keeper/types";
import { ethersWallet, ZERO_SIGHT_MARKET_ADDRESS, getCdrClient } from "./keeper/clients";
import { log } from "./keeper/logger";
import { startHealthServer } from "./keeper/health";
import { tickAsset } from "./keeper/state-machine";
import { getChainNow } from "./keeper/onchain-read";

const CHECK_INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? "15000");

const states: AssetState[] = ASSETS.map((a) => ({
  key: a.key,
  index: a.index,
  cadence: a.cadence,
  phase: "idle",
  lastError: null,
  cooldownUntil: 0,
  snapshot: null
}));

const runtime = {
  bootedAt: Date.now(),
  lastTickAt: Date.now(),
  lastError: null as string | null
};

let isRunning = false;
let stopping = false;

async function loop() {
  if (stopping) return;
  if (isRunning) {
    log.warn("loop.skipOverlapping");
    return;
  }
  isRunning = true;
  try {
    // Fetch chain time ONCE per loop and share it with every asset tick, rather
    // than each tick fetching the latest block (6× getBlock per loop before).
    let sharedNow: number | undefined;
    try {
      sharedNow = await getChainNow();
    } catch (err) {
      // If the time read fails, ticks fall back to their own fetch.
      sharedNow = undefined;
      log.warn("loop.chainNowFailed", {
        err: err instanceof Error ? err.message : String(err)
      });
    }

    for (const state of states) {
      if (stopping) break;
      try {
        await tickAsset(state, sharedNow);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.lastError = msg;
        log.error("loop.tickThrew", { asset: state.key, err: msg });
      }
    }
    runtime.lastTickAt = Date.now();
  } finally {
    isRunning = false;
  }
}

async function main() {
  log.info("keeper.boot", {
    contract: ZERO_SIGHT_MARKET_ADDRESS,
    operator: ethersWallet.address,
    intervalMs: CHECK_INTERVAL_MS,
    assets: ASSETS.map((a) => a.key)
  });

  const healthServer = startHealthServer(() => ({
    bootedAt: runtime.bootedAt,
    lastTickAt: runtime.lastTickAt,
    lastError: runtime.lastError,
    states
  }));

  // Warm the CDR validator registry/attestation cache so the first reveal of
  // the locked window doesn't stall on it. Best-effort — never blocks boot.
  void (async () => {
    try {
      const cdr = await getCdrClient();
      await cdr.consumer.prefetchRegistry();
      log.info("cdr.prefetchRegistry.ok");
    } catch (err) {
      log.warn("cdr.prefetchRegistry.failed", {
        err: err instanceof Error ? err.message : String(err)
      });
    }
  })();

  await loop();
  const timer = setInterval(loop, CHECK_INTERVAL_MS);

  // Graceful shutdown: stop accepting new work, let the in-flight tick finish.
  const shutdown = (signal: string) => {
    log.info("keeper.shutdown", { signal });
    stopping = true;
    clearInterval(timer);
    healthServer?.close();
    // Give an in-flight tick a moment to settle before exiting.
    const deadline = Date.now() + 10_000;
    const wait = setInterval(() => {
      if (!isRunning || Date.now() > deadline) {
        clearInterval(wait);
        log.info("keeper.exit");
        process.exit(0);
      }
    }, 250);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    log.error("keeper.unhandledRejection", {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
  });
}

main().catch((err) => {
  log.error("keeper.fatal", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
