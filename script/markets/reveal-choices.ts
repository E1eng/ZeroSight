import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";

import { requireEnv, MARKET_ABI, ASSET_LABELS } from "./utils";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL, STORY_API_URL } from "../../lib/story";

const ZERO_SIGHT_MARKET_ADDRESS = requireEnv(
  "NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS"
) as `0x${string}`;
const PRIVATE_KEY = requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;

// ─── Retry config ────────────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s exponential backoff

// ─── getUserBets ABI (JSON object format — viem can't parse tuple() in string ABI) ──
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

const REVEAL_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "assetIndex", type: "uint8" },
      { internalType: "address[]", name: "bettorAddresses", type: "address[]" },
      { internalType: "string[]", name: "vaultIds", type: "string[]" },
      { internalType: "uint8[]", name: "choices", type: "uint8[]" }
    ],
    name: "revealChoices",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const LOCK_ABI = [
  {
    inputs: [{ internalType: "uint8", name: "assetIndex", type: "uint8" }],
    name: "lockMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// ─── Helper: decrypt CDR vault with exponential backoff ──────────
async function decryptWithRetry(
  cdrClient: any,
  vaultId: string,
  bettor: string,
  retries = MAX_RETRIES
): Promise<{ direction: number } | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { dataKey } = await cdrClient.consumer.accessCDR({
        uuid: Number(vaultId),
        accessAuxData: "0x",
        timeoutMs: 120_000
      });

      const payloadString = new TextDecoder().decode(dataKey);
      const payload = JSON.parse(payloadString);

      if (!payload.bettor || payload.bettor.toLowerCase() !== bettor.toLowerCase()) {
        console.error(
          `  ❌ Vault Hijack Detected! Payload bettor ${payload.bettor} ≠ tx bettor ${bettor}. Skipping.`
        );
        return null;
      }

      if (payload.direction !== 0 && payload.direction !== 1) {
        console.error(`  ❌ Invalid direction ${payload.direction} in vault ${vaultId}. Skipping.`);
        return null;
      }

      return { direction: payload.direction };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isLastAttempt = attempt === retries;

      if (isLastAttempt) {
        console.error(
          `  ❌ Failed vault ${vaultId} for ${bettor} after ${retries} attempts: ${errMsg}`
        );
        console.warn(
          `  ⚠️  This bet will be REFUNDED by the contract during distribution.`
        );
        return null;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `  ⚠️  Attempt ${attempt}/${retries} failed for vault ${vaultId}: ${errMsg}. Retrying in ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const assetInput = (process.argv[2] ?? process.env.MARKET_ASSET ?? "ip").toLowerCase();
  const activeAsset = ASSET_LABELS[assetInput];
  if (activeAsset === undefined) throw new Error(`Unknown asset: ${assetInput}`);

  console.log(`Starting choice reveal process for assetIndex: ${activeAsset}...`);

  await initWasm();

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: STORY_TESTNET_CHAIN,
    transport: http(STORY_RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain: STORY_TESTNET_CHAIN,
    transport: http(STORY_RPC_URL)
  });

  const cdrClient = new CDRClient({
    network: "testnet",
    publicClient,
    walletClient,
    apiUrl: STORY_API_URL
  });

  // ── Step 1: Check market status ──────────────────────────────
  const marketStatus = (await publicClient.readContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: parseAbi(MARKET_ABI),
    functionName: "markets",
    args: [activeAsset]
  })) as any;

  const status = marketStatus[0];
  if (status !== 1 && status !== 0) {
    console.log(`Market status is ${status} (not Open/Locked). Nothing to reveal.`);
    return;
  }

  // ── Step 2: Read bettors from on-chain state (current round only) ──
  const bettors = (await publicClient.readContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: parseAbi(MARKET_ABI),
    functionName: "getBettors",
    args: [activeAsset]
  })) as `0x${string}`[];

  if (bettors.length === 0) {
    console.log("No bettors in current round.");
    if (status === 0) {
      console.log("Locking market manually...");
      const { request } = await publicClient.simulateContract({
        address: ZERO_SIGHT_MARKET_ADDRESS,
        abi: LOCK_ABI,
        functionName: "lockMarket",
        args: [activeAsset],
        account
      });
      const hash = await walletClient.writeContract(request);
      console.log(`Lock tx submitted: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
    }
    return;
  }

  console.log(`Found ${bettors.length} bettor(s) in current round.`);

  // ── Step 3: For each bettor, read their bets and find unrevealed ones ──
  const bettorsToReveal: `0x${string}`[] = [];
  const vaultIdsToReveal: string[] = [];
  const choicesToReveal: number[] = [];

  for (const bettor of bettors) {
    const bets = (await publicClient.readContract({
      address: ZERO_SIGHT_MARKET_ADDRESS,
      abi: GET_USER_BETS_ABI,
      functionName: "getUserBets",
      args: [activeAsset, bettor]
    })) as any[];

    for (const bet of bets) {
      const vaultId = bet.vaultId as string;
      const alreadyRevealed = bet.choiceRevealed as boolean;

      if (alreadyRevealed) {
        console.log(`  ✓ Vault ${vaultId} for ${bettor} already revealed. Skipping.`);
        continue;
      }

      console.log(`  Decrypting vault ${vaultId} for ${bettor}...`);
      const result = await decryptWithRetry(cdrClient, vaultId, bettor);

      if (result !== null) {
        bettorsToReveal.push(bettor);
        vaultIdsToReveal.push(vaultId);
        choicesToReveal.push(result.direction);
        console.log(
          `  ✅ Decrypted! ${bettor} chose ${result.direction === 1 ? "Up ↑" : "Down ↓"}`
        );
      }
    }
  }

  if (bettorsToReveal.length === 0) {
    console.log("No valid choices decrypted (all already revealed or CDR failed).");
    if (status === 0) {
      console.log("Locking market manually...");
      const { request } = await publicClient.simulateContract({
        address: ZERO_SIGHT_MARKET_ADDRESS,
        abi: LOCK_ABI,
        functionName: "lockMarket",
        args: [activeAsset],
        account
      });
      const hash = await walletClient.writeContract(request);
      console.log(`Lock tx submitted: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
    }
    console.log("⚠️  Any unrevealed bets will be automatically refunded during distribution.");
    return;
  }

  // ── Step 4: Submit revealChoices tx ──────────────────────────
  console.log(`\nSubmitting revealChoices for ${bettorsToReveal.length} bettor(s)...`);

  const { request } = await publicClient.simulateContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: REVEAL_ABI,
    functionName: "revealChoices",
    args: [activeAsset, bettorsToReveal, vaultIdsToReveal, choicesToReveal],
    account
  });

  const hash = await walletClient.writeContract(request);
  console.log(`Tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ Tx confirmed in block ${receipt.blockNumber}. ${bettorsToReveal.length} choice(s) revealed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
