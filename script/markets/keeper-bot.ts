/**
 * ZeroSight keeper bot — single-process state machine.
 *
 *  - All on-chain ops via centralised nonce manager (no nonce collisions).
 *  - Per-asset state machine; assets ticked sequentially each loop to avoid
 *    over-pressuring the RPC and to keep tx ordering deterministic.
 *  - Block-timestamp scheduling in UTC (no local TZ surprises).
 *  - Structured JSON-line logs in non-TTY (production-friendly), pretty in TTY.
 */
import { ASSETS } from "./keeper/types";
import type { AssetState } from "./keeper/types";
import { ethersWallet, ZERO_SIGHT_MARKET_ADDRESS } from "./keeper/clients";
import { log } from "./keeper/logger";
import { tickAsset } from "./keeper/state-machine";

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

let isRunning = false;

async function loop() {
  if (isRunning) {
    log.warn("loop.skipOverlapping");
    return;
  }
  isRunning = true;
  try {
    for (const state of states) {
      try {
        await tickAsset(state);
      } catch (err) {
        // tickAsset already classifies/cooldowns expected errors; this is
        // defensive against unexpected throws (e.g. RPC outage).
        log.error("loop.tickThrew", {
          asset: state.key,
          err: err instanceof Error ? err.message : String(err)
        });
      }
    }
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

  await loop();
  setInterval(loop, CHECK_INTERVAL_MS);
}

main().catch((err) => {
  log.error("keeper.fatal", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
