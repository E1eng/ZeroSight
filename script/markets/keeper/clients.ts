import "dotenv/config";
import { ethers } from "ethers";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { MARKET_ABI, requireEnv } from "../utils";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL, STORY_API_URL } from "../../../lib/story";

/**
 * Centralised clients. Single ethers provider + wallet for all on-chain calls,
 * single CDR client for all decryptions. Initialised once and reused — no more
 * per-subprocess wallet/nonce racing.
 */

const rpcUrl = requireEnv("STORY_RPC_URL");
const contractAddress = requireEnv("NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS");
const privateKey = (process.env.MARKET_OPERATOR_PRIVATE_KEY ??
  requireEnv("DEPLOYER_PRIVATE_KEY")) as `0x${string}`;

// ─── ethers (used by Redstone WrapperBuilder which only supports ethers v5) ──
export const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
export const ethersWallet = new ethers.Wallet(privateKey, provider);
export const ethersContract = new ethers.Contract(
  contractAddress,
  MARKET_ABI,
  ethersWallet
);
export const ethersContractRO = new ethers.Contract(
  contractAddress,
  MARKET_ABI,
  provider
);

// ─── viem (used by CDR SDK) ─────────────────────────────────────────────────
export const account = privateKeyToAccount(privateKey);
export const viemPublicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});
export const viemWalletClient = createWalletClient({
  account,
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

// ─── CDR client (lazy) ──────────────────────────────────────────────────────
let cdrClientPromise: Promise<CDRClient> | null = null;
export async function getCdrClient(): Promise<CDRClient> {
  if (!cdrClientPromise) {
    cdrClientPromise = (async () => {
      await initWasm();
      return new CDRClient({
        network: "testnet",
        publicClient: viemPublicClient,
        walletClient: viemWalletClient,
        apiUrl: STORY_API_URL
      });
    })();
  }
  return cdrClientPromise;
}

export const ZERO_SIGHT_MARKET_ADDRESS = contractAddress as `0x${string}`;
