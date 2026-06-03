import { CATEGORY_LABELS } from "../utils";
import type { AssetIndex } from "../utils";
import { alert } from "./alert";
import { decryptVault, listUnrevealedBets } from "./decrypt";
import { log } from "./logger";
import { getBettors, getChainNow, getMarketSnapshot } from "./onchain-read";
import {
  distributeWinningsTx,
  lockMarketTx,
  resolveMarketTx,
  revealChoicesTx,
  startNextMarketTx,
  sweepUnclaimedTx
} from "./onchain-write";
import { nextDeadline, resolveAt } from "./schedule";
import type { AssetState } from "./types";

const COOLDOWN_AFTER_ERROR_SEC = 30;
const DISTRIBUTE_BATCH_SIZE = 50;

// How many vaults to decrypt + reveal per tick. The locked window (deadline →
// deadline+10min) is used as a staggered decryption window: each tick chips
// away a small batch instead of blocking the whole keeper loop on one asset
// while it decrypts every vault at once. CDR decryption is slow (validator
// round-trips), so small batches keep all 6 markets progressing in parallel.
const REVEAL_BATCH_SIZE = 8;

// Max simultaneous CDR decryptions within a batch. Each decrypt is a slow
// validator round-trip (timeout up to 120s); doing them serially can blow past
// the lock window. Running a bounded number in parallel keeps the batch within
// the window without flooding the CDR API.
const DECRYPT_CONCURRENCY = Number(process.env.KEEPER_DECRYPT_CONCURRENCY ?? "4");

/**
 * Map over items with a bounded number of in-flight promises. Preserves input
 * order in the returned results array.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Single tick of the keeper for one asset. Stateless w.r.t. the chain — every
 * decision is driven by a fresh `MarketSnapshot` so we do not get out of sync
 * if a tx confirmed slowly or another operator nudged state.
 *
 * Returns the new in-memory phase. The only side-effect is at most ONE
 * privileged tx per tick — never chained — so nonce concurrency stays bounded.
 */
export async function tickAsset(state: AssetState, sharedNow?: number): Promise<void> {
  const ctx = { asset: state.key, index: state.index };

  // Cooldown: skip if we recently errored. Reuse the loop-level chain time when
  // provided so we don't fetch the latest block once per asset every tick.
  const now = sharedNow ?? (await getChainNow());
  if (state.cooldownUntil > now) {
    log.debug("tick.cooldown", { ...ctx, until: state.cooldownUntil });
    return;
  }

  let snap;
  try {
    snap = await getMarketSnapshot(state.index);
    state.snapshot = snap;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.cooldownUntil = now + COOLDOWN_AFTER_ERROR_SEC;
    log.error("tick.snapshotFailed", { ...ctx, err: state.lastError });
    return;
  }

  // ── Phase 1: PRE-OPEN ───────────────────────────────────────────────
  // status === Resolved (or never-initialized with deadline=0).
  if (snap.status === 2 || snap.deadline === 0) {
    // Distribute remaining if previous round wasn't fully paid out.
    if (snap.status === 2 && !snap.isFullyDistributed) {
      log.info("phase.distributePending", {
        ...ctx,
        round: snap.currentRoundId,
        idx: snap.distributionIndex,
        bettors: snap.bettorCount
      });
      try {
        await distributeWinningsTx({
          assetIndex: state.index,
          batchSize: DISTRIBUTE_BATCH_SIZE
        });
        state.phase = "distributing";
      } catch (err) {
        return finishWithError(state, "distributeWinnings", err, now);
      }
      return;
    }

    // Sweep dust if any (and only if pool somehow stayed positive).
    if (snap.status === 2 && snap.totalPool > 0n) {
      log.info("phase.sweep", { ...ctx, round: snap.currentRoundId, pool: snap.totalPool });
      try {
        await sweepUnclaimedTx(state.index);
      } catch (err) {
        return finishWithError(state, "sweepUnclaimed", err, now);
      }
      return;
    }

    // All clean — open next round.
    const deadline = nextDeadline(state.index, now);
    log.info("phase.startingNextMarket", {
      ...ctx,
      previousRound: snap.currentRoundId,
      deadline,
      offsetSec: deadline - now
    });
    try {
      await startNextMarketTx({
        category: CATEGORY_LABELS["crypto"],
        assetIndex: state.index,
        newDeadline: deadline
      });
      state.phase = "open";
    } catch (err) {
      return finishWithError(state, "startNextMarket", err, now);
    }
    return;
  }

  // ── Phase 2: OPEN — waiting for deadline ────────────────────────────
  if (snap.status === 0 && now < snap.deadline) {
    state.phase = "open";
    log.debug("phase.open", { ...ctx, secondsLeft: snap.deadline - now });
    return;
  }

  // ── Phase 3: DEADLINE PASSED, status still Open → lock immediately ──
  // Locking is a cheap instant tx; we do NOT block it on slow CDR decryption.
  // Once locked, the staggered reveal happens during the locked window below.
  if (snap.status === 0 && now >= snap.deadline) {
    state.phase = "locking";
    try {
      await lockMarketTx(state.index);
      state.phase = "revealing";
      log.info("phase.locked", { ...ctx, round: snap.currentRoundId });
    } catch (err) {
      return finishWithError(state, "lockMarket", err, now);
    }
    return;
  }

  // ── Phase 4: LOCKED → staggered reveal, then resolve at +10min ─────
  if (snap.status === 1) {
    const bettors = await getBettors(state.index);
    const remaining = await listUnrevealedBets(state.index, bettors);

    // Reveal a small batch per tick while there's still anything to decrypt
    // AND we still have time before the resolve window. This spreads CDR load
    // across the locked window instead of one giant blocking decrypt.
    if (remaining.length > 0 && now < resolveAt(snap.deadline, state.index)) {
      await revealBatch(state, remaining, now);
      return;
    }

    if (now >= resolveAt(snap.deadline, state.index)) {
      if (remaining.length > 0) {
        // Last-chance reveal right before resolving; whatever still fails will
        // be refunded by the contract during distribution.
        log.info("phase.finalReveal", { ...ctx, remaining: remaining.length });
        await revealBatch(state, remaining, now);
        return;
      }
      log.info("phase.resolving", { ...ctx, deadline: snap.deadline });
      try {
        await resolveMarketTx(state.index);
        state.phase = "distributing";
      } catch (err) {
        return finishWithError(state, "resolveMarket", err, now);
      }
      return;
    }

    state.phase = "revealed";
    log.debug("phase.lockedIdle", {
      ...ctx,
      resolvesIn: resolveAt(snap.deadline, state.index) - now
    });
    return;
  }
}

/**
 * Decrypt + reveal up to REVEAL_BATCH_SIZE vaults this tick. Bets that fail to
 * decrypt are skipped (left unrevealed → refunded at distribution). Submits a
 * single revealChoices tx for whatever decrypted successfully this batch.
 */
async function revealBatch(
  state: AssetState,
  unrevealed: { bettor: string; vaultId: string }[],
  now: number
) {
  const ctx = { asset: state.key, index: state.index };
  const batch = unrevealed.slice(0, REVEAL_BATCH_SIZE);

  log.info("decrypt.batch", { ...ctx, batch: batch.length, remaining: unrevealed.length });

  // Decrypt the batch with bounded concurrency instead of one-at-a-time.
  const decrypted = await mapWithConcurrency(batch, DECRYPT_CONCURRENCY, (item) =>
    decryptVault(item.vaultId, item.bettor)
  );

  const revealedBettors: string[] = [];
  const revealedVaults: string[] = [];
  const revealedChoices: number[] = [];

  for (let i = 0; i < batch.length; i++) {
    const result = decrypted[i];
    if (result === null) continue; // stays unrevealed → refunded later
    revealedBettors.push(batch[i].bettor);
    revealedVaults.push(batch[i].vaultId);
    revealedChoices.push(result.direction);
  }

  log.info("decrypt.summary", {
    ...ctx,
    attempted: batch.length,
    decrypted: revealedBettors.length,
    failed: batch.length - revealedBettors.length
  });

  if (revealedBettors.length === 0) {
    // Nothing decrypted this batch (all failed). Next tick retries the rest.
    return;
  }

  try {
    await revealChoicesTx({
      assetIndex: state.index,
      bettors: revealedBettors,
      vaultIds: revealedVaults,
      choices: revealedChoices
    });
    state.phase = "revealing";
  } catch (err) {
    return finishWithError(state, "revealChoices", err, now);
  }
}

function finishWithError(state: AssetState, label: string, err: unknown, now: number) {
  state.lastError = err instanceof Error ? err.message : String(err);
  state.cooldownUntil = now + COOLDOWN_AFTER_ERROR_SEC;
  state.phase = "error";
  log.error("tick.txFailed", {
    asset: state.key,
    index: state.index,
    op: label,
    cooldownUntil: state.cooldownUntil,
    err: state.lastError
  });
  // Fire-and-forget alert for fee/settlement-critical ops; rate-limited inside.
  void alert(`tx.${label}.${state.key}`, `Keeper op failed: ${label}`, {
    asset: state.key,
    index: state.index,
    error: state.lastError
  });
}
