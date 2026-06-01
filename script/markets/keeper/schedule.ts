/**
 * Deadline scheduling. ALL math is in UTC seconds — never local timezone.
 * Hourly markets close at minute 50 of each UTC hour.
 * Daily markets close at 23:50 UTC.
 */

import type { AssetIndex } from "../utils";

const HOURLY_CLOSE_MINUTE = 50;
const DAILY_CLOSE_HOUR_UTC = 23;
const DAILY_CLOSE_MINUTE_UTC = 50;

/**
 * Given chain `now` (unix seconds), returns the next "close" deadline (unix
 * seconds) for the asset's cadence. Falls back to a sensible default offset
 * if scheduling math somehow lands in the past.
 */
export function nextDeadline(assetIndex: AssetIndex, chainNow: number): number {
  const isDaily = assetIndex >= 3;
  const nowMs = chainNow * 1000;

  if (!isDaily) {
    // Hourly slot: minute 50 of the current UTC hour, or next hour if we're past it.
    const d = new Date(nowMs);
    const candidate = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      HOURLY_CLOSE_MINUTE,
      0,
      0
    );
    let target = candidate;
    if (target <= nowMs) target += 60 * 60 * 1000; // bump to next hour
    return Math.floor(target / 1000);
  }

  // Daily slot: 23:50 UTC of today, or tomorrow if we're past it.
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
 * Resolve window: 10 minutes after deadline. Resolve before this is wasted gas
 * since `block.timestamp > deadline` must be true and we want a small buffer
 * for re-org / RPC drift.
 */
export function resolveAt(deadline: number): number {
  return deadline + 10 * 60;
}
