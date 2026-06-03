import type { AssetIndex } from "../utils";
import { ethersContractRO } from "./clients";
import { getCdrClient } from "./clients";
import { log } from "./logger";

/**
 * CDR decryption with retry/backoff. Returns the user's chosen direction
 * (0=Down, 1=Up) or null if the vault could not be decrypted (which causes a
 * full refund during distribution).
 *
 * IMPORTANT: vault payload is also validated against the on-chain bettor
 * address — a malicious user crafting another wallet's vaultId cannot get
 * their fake payload accepted.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export async function decryptVault(
  vaultId: string,
  bettor: string
): Promise<{ direction: 0 | 1 } | null> {
  const cdr = await getCdrClient();

  const uuidNum = Number(vaultId);
  if (!Number.isSafeInteger(uuidNum) || uuidNum < 0 || uuidNum > 0xffffffff) {
    log.warn("decrypt.invalidUuid", { vaultId, bettor });
    return null;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { dataKey } = await cdr.consumer.accessCDR({
        uuid: uuidNum,
        accessAuxData: "0x",
        timeoutMs: 120_000
      });

      const payloadString = new TextDecoder().decode(dataKey);
      const payload = JSON.parse(payloadString);

      if (
        !payload.bettor ||
        typeof payload.bettor !== "string" ||
        payload.bettor.toLowerCase() !== bettor.toLowerCase()
      ) {
        log.warn("decrypt.payloadBettorMismatch", {
          vaultId,
          expected: bettor,
          got: payload.bettor
        });
        return null;
      }

      const dir = Number(payload.direction);
      if (dir !== 0 && dir !== 1) {
        log.warn("decrypt.invalidDirection", { vaultId, direction: payload.direction });
        return null;
      }

      return { direction: dir as 0 | 1 };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // An empty vault never had ciphertext written (e.g. the write tx failed
      // after allocate). The SDK raises this synchronously before spending a
      // read fee — retrying can't help, so bail immediately → refund.
      const name = err instanceof Error ? err.name : "";
      if (name === "EmptyVaultError" || /empty vault/i.test(errMsg)) {
        log.warn("decrypt.emptyVault", { vaultId, bettor });
        return null;
      }

      const last = attempt === MAX_RETRIES;
      if (last) {
        log.error("decrypt.failed", { vaultId, bettor, attempts: MAX_RETRIES, err: errMsg });
        return null;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log.warn("decrypt.retry", { vaultId, attempt, delay, err: errMsg });
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return null;
}

// ABI for getUserBets is JSON form because viem-style string ABI can't parse tuple[].
const GET_USER_BETS_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "assetIndex", type: "uint8" },
      { internalType: "address", name: "bettor", type: "address" }
    ],
    name: "getUserBets",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "shares", type: "uint256" },
          { internalType: "uint8", name: "assetIndex", type: "uint8" },
          { internalType: "string", name: "vaultId", type: "string" },
          { internalType: "uint8", name: "direction", type: "uint8" },
          { internalType: "bool", name: "choiceRevealed", type: "bool" },
          { internalType: "bool", name: "distributed", type: "bool" },
          { internalType: "uint256", name: "placedAt", type: "uint256" }
        ],
        internalType: "struct ZeroSightMarket.BetInfo[]",
        name: "",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

import { ethers } from "ethers";
import { ZERO_SIGHT_MARKET_ADDRESS, provider } from "./clients";

const userBetsContract = new ethers.Contract(
  ZERO_SIGHT_MARKET_ADDRESS,
  GET_USER_BETS_ABI as any,
  provider
);

export interface UnrevealedBet {
  bettor: string;
  vaultId: string;
}

/** Reads on-chain bets and returns the ones still flagged unrevealed.
 *  Reads run with bounded concurrency so a round with many bettors doesn't
 *  serialise into N blocking RPC round-trips per tick. */
const READ_CONCURRENCY = Number(process.env.KEEPER_READ_CONCURRENCY ?? "8");

export async function listUnrevealedBets(
  assetIndex: AssetIndex,
  bettors: string[]
): Promise<UnrevealedBet[]> {
  const out: UnrevealedBet[] = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= bettors.length) return;
      const bettor = bettors[i];
      const bets = (await userBetsContract.getUserBets(assetIndex, bettor)) as Array<{
        vaultId: string;
        choiceRevealed: boolean;
        assetIndex: number;
      }>;
      for (const bet of bets) {
        if (!bet.choiceRevealed) out.push({ bettor, vaultId: bet.vaultId });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, bettors.length) },
    () => worker()
  );
  await Promise.all(workers);
  return out;
}
