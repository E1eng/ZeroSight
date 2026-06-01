import { CATEGORY_LABELS } from "../utils";
import type { AssetIndex } from "../utils";
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

/**
 * Single tick of the keeper for one asset. Stateless w.r.t. the chain — every
 * decision is driven by a fresh `MarketSnapshot` so we do not get out of sync
 * if a tx confirmed slowly or another operator nudged state.
 *
 * Returns the new in-memory phase. The only side-effect is at most ONE
 * privileged tx per tick — never chained — so nonce concurrency stays bounded.
 */
export async function tickAsset(state: AssetState): Promise<void> {
  const ctx = { asset: state.key, index: state.index };

  // Cooldown: skip if we recently errored.
  const now = await getChainNow();
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

  // ── Phase 3: DEADLINE PASSED, status still Open → reveal+lock ──────
  if (snap.status === 0 && now >= snap.deadline) {
    state.phase = "locking";
    await runReveal(state, now);
    return;
  }

  // ── Phase 4: LOCKED → reveal lingering, then resolve at +10min ─────
  if (snap.status === 1) {
    // It's possible some bets weren't revealed in the prior tick (CDR slow).
    const bettors = await getBettors(state.index);
    const remaining = await listUnrevealedBets(state.index, bettors);
    if (remaining.length > 0) {
      log.info("phase.lingerReveal", { ...ctx, remaining: remaining.length });
      await runReveal(state, now);
      return;
    }

    if (now >= resolveAt(snap.deadline)) {
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
    log.debug("phase.locked", {
      ...ctx,
      resolvesIn: resolveAt(snap.deadline) - now
    });
    return;
  }
}

async function runReveal(state: AssetState, now: number) {
  const ctx = { asset: state.key, index: state.index };
  const bettors = await getBettors(state.index);

  if (bettors.length === 0) {
    // No bettors at all in this round — just lock if still Open.
    if (state.snapshot?.status === 0) {
      log.info("phase.lockEmpty", ctx);
      try {
        await lockMarketTx(state.index);
      } catch (err) {
        return finishWithError(state, "lockMarket", err, now);
      }
    }
    return;
  }

  const unrevealed = await listUnrevealedBets(state.index, bettors);
  if (unrevealed.length === 0) {
    // Nothing left to reveal — lock if still open.
    if (state.snapshot?.status === 0) {
      try {
        await lockMarketTx(state.index);
      } catch (err) {
        return finishWithError(state, "lockMarket", err, now);
      }
    }
    return;
  }

  log.info("decrypt.batch", { ...ctx, count: unrevealed.length });
  const revealedBettors: string[] = [];
  const revealedVaults: string[] = [];
  const revealedChoices: number[] = [];

  for (const item of unrevealed) {
    const result = await decryptVault(item.vaultId, item.bettor);
    if (result === null) continue; // stays unrevealed → refunded later
    revealedBettors.push(item.bettor);
    revealedVaults.push(item.vaultId);
    revealedChoices.push(result.direction);
  }

  log.info("decrypt.summary", {
    ...ctx,
    attempted: unrevealed.length,
    decrypted: revealedBettors.length,
    failed: unrevealed.length - revealedBettors.length
  });

  if (revealedBettors.length === 0) {
    // CDR all failed — fall back to lock so distribute can refund.
    if (state.snapshot?.status === 0) {
      try {
        await lockMarketTx(state.index);
      } catch (err) {
        return finishWithError(state, "lockMarket", err, now);
      }
    }
    return;
  }

  try {
    await revealChoicesTx({
      assetIndex: state.index,
      bettors: revealedBettors,
      vaultIds: revealedVaults,
      choices: revealedChoices
    });
    state.phase = "revealed";
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
}
