/**
 * Deadline scheduling. ALL math is in UTC seconds — never local timezone.
 *
 * Hourly markets: a short rolling cycle for fast testing/demo. Defaults to a
 *   5-minute cycle = 4 min open + 1 min locked window. Override via env:
 *     HOURLY_OPEN_SECONDS  (default 240)
 *     HOURLY_LOCK_SECONDS  (default 60)
 *
 * Daily markets: wall-clock aligned — close at 23:50 UTC, resolve 10 min later.
 */

import type { AssetIndex } from "../utils";

const HOURLY_OPEN_SECONDS = Number(process.env.HOURLY_OPEN_SECONDS ?? "240"); // 4 min
const HOURLY_LOCK_SECONDS = Number(process.env.HOURLY_LOCK_SECONDS ?? "60"); // 1 min

const DAILY_CLOSE_HOUR_UTC = 23;
const DAILY_CLOSE_MINUTE_UTC = 50;
const DAILY_LOCK_SECONDS = 10 * 60; // 10 min

function isDaily(assetIndex: AssetIndex): boolean {
  return assetIndex >= 3;
}

/**
 * Given chain `now` (unix seconds), returns the next betting deadline (unix
 * seconds) for the asset's cadence.
 *
 * Hourly uses a simple rolling offset (now + open window) so cycles are short
 * and predictable for testing. Daily snaps to the next 23:50 UTC boundary.
 */
export function nextDeadline(assetIndex: AssetIndex, chainNow: number): number {
  if (!isDaily(assetIndex)) {
    return chainNow + HOURLY_OPEN_SECONDS;
  }

  const nowMs = chainNow * 1000;
  const d = new Date(nowMs);
  let target = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    DAILY_CLOSE_HOUR_UTC,
    DAILY_CLOSE_MINUTE_UTC,
    0,
    0
  );
  if (target <= nowMs) target += 24 * 60 * 60 * 1000;
  return Math.floor(target / 1000);
}

/**
 * When to resolve: deadline + lock window. Hourly = short (1 min default),
 * daily = 10 min. This is the gap between betting cutoff and price settlement.
 */
export function resolveAt(deadline: number, assetIndex: AssetIndex): number {
  return deadline + (isDaily(assetIndex) ? DAILY_LOCK_SECONDS : HOURLY_LOCK_SECONDS);
}
