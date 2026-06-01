import { ethersContractRO, provider } from "./clients";
import type { AssetIndex } from "../utils";
import type { MarketSnapshot } from "./types";

/**
 * Read-only on-chain helpers. No tx, no nonce. Cheap and idempotent — safe to
 * call from every state-machine tick.
 */

/** Fetches latest block timestamp. We never trust local Date.now() for scheduling. */
export async function getChainNow(): Promise<number> {
  const block = await provider.getBlock("latest");
  return block.timestamp;
}

export async function getMarketSnapshot(assetIndex: AssetIndex): Promise<MarketSnapshot> {
  const [m, bettorCount, fullyDistributed, currentRoundId] = await Promise.all([
    ethersContractRO.markets(assetIndex),
    ethersContractRO.getBettorCount(assetIndex),
    ethersContractRO.isFullyDistributed(assetIndex),
    ethersContractRO.currentRoundId(assetIndex)
  ]);

  return {
    status: Number(m.status) as 0 | 1 | 2,
    totalPool: BigInt(m.totalPool.toString()),
    openedAt: Number(m.openedAt),
    deadline: Number(m.deadline),
    openingPrice: BigInt(m.openingPrice.toString()),
    resolvedPrice: BigInt(m.resolvedPrice.toString()),
    winningChoice: Number(m.winningChoice),
    payoutPool: BigInt(m.payoutPool.toString()),
    winningSharesTotal: BigInt(m.winningSharesTotal.toString()),
    distributionIndex: BigInt(m.distributionIndex.toString()),
    bettorCount: Number(bettorCount),
    isFullyDistributed: Boolean(fullyDistributed),
    currentRoundId: BigInt(currentRoundId.toString())
  };
}

export async function getOracleSigners(): Promise<string[]> {
  const signers = await ethersContractRO.getOracleSigners();
  return signers;
}

export async function getBettors(assetIndex: AssetIndex): Promise<string[]> {
  const list = await ethersContractRO.getBettors(assetIndex);
  return list;
}
