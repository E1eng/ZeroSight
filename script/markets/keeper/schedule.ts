/**
 * Deadline scheduling. ALL math is in UTC seconds — never local timezone.
 *
 * Hourly markets: wall-clock aligned — betting closes at minute 50 of each
 *   hour, resolves 10 minutes later at the top of the next hour. All hourly
 *   assets share the same boundaries, so rounds open/close in sync.
 *
 * Daily markets: wall-clock aligned — close at 23:50 UTC, resolve 10 min later.
 */

import type { AssetIndex } from "../utils";

const HOURLY_CLOSE_MINUTE_UTC = 50; // betting closes at :50 each hour
const HOURLY_LOCK_SECONDS = 10 * 60; // :50 close → :00 resolve (next hour)

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
 * Hourly snaps to the next :50 boundary; daily snaps to the next 23:50 UTC.
 */
export function nextDeadline(assetIndex: AssetIndex, chainNow: number): number {
  const nowMs = chainNow * 1000;
  const d = new Date(nowMs);

  if (!isDaily(assetIndex)) {
    let target = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      HOURLY_CLOSE_MINUTE_UTC,
      0,
      0
    );
    // If we're already past :50 this hour, roll to next hour's :50.
    if (target <= nowMs) target += 60 * 60 * 1000;
    return Math.floor(target / 1000);
  }

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
 * When to resolve: deadline + lock window (10 min for both cadences). This is
 * the gap between betting cutoff and price settlement.
 */
export function resolveAt(deadline: number, assetIndex: AssetIndex): number {
  return deadline + (isDaily(assetIndex) ? DAILY_LOCK_SECONDS : HOURLY_LOCK_SECONDS);
}
