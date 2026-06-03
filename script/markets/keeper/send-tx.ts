import { ethers } from "ethers";

import { provider } from "./clients";
import { log } from "./logger";

/**
 * Resilient tx sender: submit → wait-with-timeout → replace-by-fee (gas bump).
 *
 * Why this exists: the keeper serialises every tx behind a single nonce lock,
 * and previously waited on `tx.wait()` with NO timeout. A single underpriced
 * or stuck tx would hang that wait forever, never release the lock, and
 * deadlock the entire keeper until a manual restart.
 *
 * This sender instead polls for the receipt with a hard timeout. If the tx
 * doesn't confirm in time, it resubmits with the SAME nonce and bumped gas
 * (replace-by-fee). Whichever tx mines first wins; we poll ALL submitted hashes
 * so we never miss the one that actually landed. A reverted receipt (status 0)
 * is surfaced as an error so callers can cooldown/alert.
 */

const TX_WAIT_TIMEOUT_MS = Number(process.env.KEEPER_TX_TIMEOUT_MS ?? "45000"); // per attempt
const TX_MAX_ATTEMPTS = Number(process.env.KEEPER_TX_MAX_ATTEMPTS ?? "3");
const GAS_BUMP_PERCENT = Number(process.env.KEEPER_GAS_BUMP_PERCENT ?? "30"); // +30%/retry
const TX_CONFIRMATIONS = Number(process.env.KEEPER_TX_CONFIRMATIONS ?? "1");
const RECEIPT_POLL_MS = Number(process.env.KEEPER_RECEIPT_POLL_MS ?? "3000");

export type SubmitFn = (
  overrides: ethers.Overrides
) => Promise<ethers.providers.TransactionResponse>;

interface GasFields {
  maxFeePerGas?: ethers.BigNumber;
  maxPriorityFeePerGas?: ethers.BigNumber;
  gasPrice?: ethers.BigNumber;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function baseFee(): Promise<GasFields> {
  const fee = await provider.getFeeData();
  // EIP-1559 chain
  if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
    return { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas };
  }
  // Legacy chain (Story Aeneid deploys use --legacy gas)
  if (fee.gasPrice) return { gasPrice: fee.gasPrice };
  return {};
}

function bump(fields: GasFields, percent: number): GasFields {
  const apply = (x?: ethers.BigNumber) => (x ? x.mul(100 + percent).div(100) : undefined);
  return {
    maxFeePerGas: apply(fields.maxFeePerGas),
    maxPriorityFeePerGas: apply(fields.maxPriorityFeePerGas),
    gasPrice: apply(fields.gasPrice)
  };
}

function toOverrides(nonce: number, gas: GasFields): ethers.Overrides {
  const o: ethers.Overrides = { nonce };
  if (gas.maxFeePerGas) o.maxFeePerGas = gas.maxFeePerGas;
  if (gas.maxPriorityFeePerGas) o.maxPriorityFeePerGas = gas.maxPriorityFeePerGas;
  if (gas.gasPrice) o.gasPrice = gas.gasPrice;
  return o;
}

function describeGas(gas: GasFields): string {
  if (gas.gasPrice) return `${ethers.utils.formatUnits(gas.gasPrice, "gwei")}gwei`;
  if (gas.maxFeePerGas) return `${ethers.utils.formatUnits(gas.maxFeePerGas, "gwei")}gwei(max)`;
  return "node-default";
}

/** Poll every tracked hash until one confirms or the timeout elapses. */
async function pollAnyReceipt(
  hashes: string[],
  timeoutMs: number
): Promise<ethers.providers.TransactionReceipt | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const hash of hashes) {
      try {
        const r = await provider.getTransactionReceipt(hash);
        if (r && r.confirmations >= TX_CONFIRMATIONS) return r;
      } catch {
        /* transient RPC error — retry next poll */
      }
    }
    await sleep(RECEIPT_POLL_MS);
  }
  return null;
}

export async function sendWithRetry(
  label: string,
  nonce: number,
  submit: SubmitFn
): Promise<ethers.providers.TransactionReceipt> {
  let gas = await baseFee();
  const hashes: string[] = [];

  for (let attempt = 1; attempt <= TX_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) gas = bump(gas, GAS_BUMP_PERCENT);

    try {
      const tx = await submit(toOverrides(nonce, gas));
      hashes.push(tx.hash);
      log.info(`tx.${label}.submitted`, {
        attempt,
        nonce,
        hash: tx.hash,
        gas: describeGas(gas)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // On a retry, "nonce too low / already known / underpriced" means a prior
      // attempt already landed in a block — fall through and poll the hashes.
      if (attempt > 1 && /nonce too low|already known|underpriced|replacement/i.test(msg)) {
        log.warn(`tx.${label}.replaceRace`, { attempt, nonce, err: msg });
      } else {
        // First-attempt failures are genuine reverts (eth_estimateGas caught
        // e.g. "market closed", "onlyKeeperOrOwner") — surface immediately.
        throw err;
      }
    }

    const receipt = await pollAnyReceipt(hashes, TX_WAIT_TIMEOUT_MS);
    if (receipt) {
      if (receipt.status === 0) {
        throw new Error(`${label} reverted on-chain (nonce ${nonce}, tx ${receipt.transactionHash})`);
      }
      log.info(`tx.${label}.confirmed`, {
        attempt,
        hash: receipt.transactionHash,
        block: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });
      return receipt;
    }

    log.warn(`tx.${label}.timeout`, {
      attempt,
      nonce,
      timeoutMs: TX_WAIT_TIMEOUT_MS,
      willBump: attempt < TX_MAX_ATTEMPTS ? `+${GAS_BUMP_PERCENT}%` : "none"
    });
  }

  throw new Error(
    `${label}: not confirmed after ${TX_MAX_ATTEMPTS} attempts (nonce ${nonce}); hashes=${hashes.join(",")}`
  );
}
