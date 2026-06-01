import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { ethers } from "ethers";

import { ethersContract, provider } from "./clients";
import { nonceManager } from "./nonce";
import { log } from "./logger";
import { FEED_IDS, type AssetIndex } from "../utils";

/**
 * On-chain write helpers. All txs go through the central nonce manager.
 *
 * Each helper returns the tx receipt so callers can log block numbers + gas.
 * Errors are NOT swallowed — callers handle them and translate to phase
 * transitions (e.g. cooldown on revert).
 */

const REDSTONE_DATA_SERVICE = process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-primary-prod";
const REDSTONE_SIGNERS_THRESHOLD = Number(process.env.REDSTONE_SIGNERS_THRESHOLD ?? "3");

async function authorizedSigners(): Promise<string[]> {
  return ethersContract.getOracleSigners();
}

function wrapWithRedstone(dataPackagesId: string, authorized: string[]) {
  return WrapperBuilder.wrap(ethersContract).usingDataService({
    dataServiceId: REDSTONE_DATA_SERVICE,
    uniqueSignersCount: REDSTONE_SIGNERS_THRESHOLD,
    dataPackagesIds: [dataPackagesId],
    authorizedSigners: authorized
  } as any);
}

/** Ensures gas params are explicitly set so the JSON-RPC node never silently drops the tx. */
async function txOpts(nonce: number, extra: ethers.Overrides = {}): Promise<ethers.Overrides> {
  const fee = await provider.getFeeData();
  const overrides: ethers.Overrides = {
    nonce,
    ...extra
  };

  if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
    overrides.maxFeePerGas = fee.maxFeePerGas;
    overrides.maxPriorityFeePerGas = fee.maxPriorityFeePerGas;
  } else if (fee.gasPrice) {
    overrides.gasPrice = fee.gasPrice;
  }

  return overrides;
}

export async function startNextMarketTx(params: {
  category: number;
  assetIndex: AssetIndex;
  newDeadline: number;
}) {
  const { category, assetIndex, newDeadline } = params;

  return nonceManager.withNonce("startNextMarket", async (nonce) => {
    const signers = await authorizedSigners();
    const wrapped = wrapWithRedstone(FEED_IDS[assetIndex], signers);
    const overrides = await txOpts(nonce);

    const tx = await wrapped.startNextMarket(category, assetIndex, newDeadline, overrides);
    log.info("tx.startNextMarket.submitted", {
      assetIndex,
      category,
      newDeadline,
      hash: tx.hash,
      nonce
    });
    const receipt = await tx.wait();
    log.info("tx.startNextMarket.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    });
    return receipt;
  });
}

export async function lockMarketTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("lockMarket", async (nonce) => {
    const overrides = await txOpts(nonce);
    const tx = await ethersContract.lockMarket(assetIndex, overrides);
    log.info("tx.lockMarket.submitted", { assetIndex, hash: tx.hash, nonce });
    const receipt = await tx.wait();
    log.info("tx.lockMarket.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber
    });
    return receipt;
  });
}

export async function revealChoicesTx(params: {
  assetIndex: AssetIndex;
  bettors: string[];
  vaultIds: string[];
  choices: number[];
}) {
  const { assetIndex, bettors, vaultIds, choices } = params;

  return nonceManager.withNonce("revealChoices", async (nonce) => {
    const overrides = await txOpts(nonce);
    const tx = await ethersContract.revealChoices(
      assetIndex,
      bettors,
      vaultIds,
      choices,
      overrides
    );
    log.info("tx.revealChoices.submitted", {
      assetIndex,
      count: bettors.length,
      hash: tx.hash,
      nonce
    });
    const receipt = await tx.wait();
    log.info("tx.revealChoices.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber,
      revealed: bettors.length
    });
    return receipt;
  });
}

export async function resolveMarketTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("resolveMarket", async (nonce) => {
    const signers = await authorizedSigners();
    const wrapped = wrapWithRedstone(FEED_IDS[assetIndex], signers);
    const overrides = await txOpts(nonce);

    const tx = await wrapped.resolveMarket(assetIndex, overrides);
    log.info("tx.resolveMarket.submitted", { assetIndex, hash: tx.hash, nonce });
    const receipt = await tx.wait();
    log.info("tx.resolveMarket.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber
    });
    return receipt;
  });
}

export async function distributeWinningsTx(params: {
  assetIndex: AssetIndex;
  batchSize: number;
}) {
  const { assetIndex, batchSize } = params;

  return nonceManager.withNonce("distributeWinnings", async (nonce) => {
    const overrides = await txOpts(nonce);
    const tx = await ethersContract.distributeWinnings(assetIndex, batchSize, overrides);
    log.info("tx.distributeWinnings.submitted", {
      assetIndex,
      batchSize,
      hash: tx.hash,
      nonce
    });
    const receipt = await tx.wait();
    log.info("tx.distributeWinnings.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    });
    return receipt;
  });
}

export async function sweepUnclaimedTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("sweepUnclaimed", async (nonce) => {
    const overrides = await txOpts(nonce);
    const tx = await ethersContract.sweepUnclaimed(assetIndex, overrides);
    log.info("tx.sweepUnclaimed.submitted", { assetIndex, hash: tx.hash, nonce });
    const receipt = await tx.wait();
    log.info("tx.sweepUnclaimed.confirmed", {
      assetIndex,
      hash: tx.hash,
      block: receipt.blockNumber
    });
    return receipt;
  });
}
