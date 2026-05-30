import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";

import { requireEnv, MARKET_ABI } from "./utils";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL, STORY_API_URL } from "../../lib/story";

const ZERO_SIGHT_MARKET_ADDRESS = requireEnv(
  "NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS"
) as `0x${string}`;
const PRIVATE_KEY = requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;

async function main() {
  const assetInput = (process.argv[2] ?? process.env.MARKET_ASSET ?? "ip").toLowerCase();
  const assetLabels: Record<string, number> = { ip: 0, btc: 1, eth: 2 };
  const activeAsset = assetLabels[assetInput];
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

  // Check market status using the new mapping
  const marketStatus = await publicClient.readContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "markets",
    args: [activeAsset]
  }) as any;
  
  const status = marketStatus[0]; // status is the first returned value

  if (status !== 1) {
    console.log("Market status is", status);
  }

  const betPlacedEvent = parseAbiItem(
    "event BetPlaced(address indexed bettor, string vaultId, uint8 assetIndex, uint256 amount)"
  );

  // In a production app, we would query from the block height where the market opened.
  // For the hackathon, querying from genesis or a fixed block is fine.
  const logs = await publicClient.getLogs({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    event: betPlacedEvent,
    fromBlock: "earliest",
    toBlock: "latest"
  });

  const validBets = logs.filter((log) => log.args.assetIndex === activeAsset);

  if (validBets.length === 0) {
    console.log("No bets found for the active market round.");
    return;
  }

  const bettorsToReveal: `0x${string}`[] = [];
  const vaultIdsToReveal: string[] = [];
  const choicesToReveal: number[] = [];

  for (const log of validBets) {
    const bettor = log.args.bettor!;
    const vaultId = log.args.vaultId!;

    console.log(`Decrypting vault ${vaultId} for bettor ${bettor}...`);
    try {
      const { dataKey } = await cdrClient.consumer.accessCDR({
        uuid: Number(vaultId),
        accessAuxData: "0x",
        timeoutMs: 120_000
      });

      const payloadString = new TextDecoder().decode(dataKey);
      const payload = JSON.parse(payloadString);

      if (!payload.bettor || payload.bettor.toLowerCase() !== bettor.toLowerCase()) {
        throw new Error(`Vault Hijack Detected! Payload bettor ${payload.bettor} does not match tx bettor ${bettor}.`);
      }

      if (payload.direction !== 0 && payload.direction !== 1) {
        throw new Error("Invalid direction payload");
      }

      bettorsToReveal.push(bettor);
      vaultIdsToReveal.push(vaultId);
      choicesToReveal.push(payload.direction);
      console.log(
        `✅ Decrypted successfully! Bettor ${bettor} chose ${payload.direction === 1 ? "Up" : "Down"}`
      );
    } catch (err) {
      console.error(
        `❌ Failed to decrypt vault ${vaultId} for bettor ${bettor}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (bettorsToReveal.length === 0) {
    console.log("No valid choices decrypted. Exiting.");
    return;
  }

  console.log(`Submitting revealChoices for ${bettorsToReveal.length} bettors...`);

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
  console.log(`Tx confirmed in block ${receipt.blockNumber}.`);
}

main().catch(console.error);
