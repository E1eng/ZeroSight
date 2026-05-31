import "dotenv/config";
import { createPublicClient, createWalletClient, http, toHex, encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CDRClient, initWasm, uuidToLabel } from "@piplabs/cdr-sdk";

import { requireEnv } from "./markets/utils";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL, STORY_API_URL, OWNER_WRITE_CONDITION, OWNER_ADDRESS } from "../lib/story";

const PRIVATE_KEY = requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;

async function main() {
  console.log("Initializing WASM...");
  await initWasm();

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Wallet Address: ${account.address}`);

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

  console.log(`Connected to CDR API at: ${STORY_API_URL}`);

  // 1. Create Payload
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      bettor: account.address.toLowerCase(),
      market: "test",
      direction: 1, // Up
      amount: 0.1,
      feed: "test_feed",
      placedAt: Date.now()
    })
  );

  console.log("Allocating vault on Secret Network (this may take a moment)...");

  // Owner-only: writer must match wallet, reads gated to the OWNER_ADDRESS EOA via the condition contract.
  const writeConditionData = encodeAbiParameters([{ type: "address" }], [account.address]);

  let uuid;
  try {
    const allocation = await cdrClient.uploader.allocate({
      updatable: false,
      writeConditionAddr: OWNER_WRITE_CONDITION,
      writeConditionData,
      readConditionAddr: account.address,
      readConditionData: "0x",
      skipConditionValidation: true
    });
    
    uuid = allocation.uuid;
    console.log(`✅ Vault Allocated! UUID: ${uuid}, TxHash: ${allocation.txHash}`);

    const globalPubKey = await cdrClient.observer.getGlobalPubKey();
    const label = uuidToLabel(uuid);

    console.log("Encrypting Data Key...");
    const ciphertext = await cdrClient.uploader.encryptDataKey({
      dataKey: payloadBytes,
      globalPubKey,
      label
    });

    console.log("Writing Encrypted Payload to Vault...");
    await cdrClient.uploader.write({
      uuid,
      accessAuxData: "0x",
      encryptedData: toHex(ciphertext.raw)
    });
    console.log(`✅ Payload Successfully Written to Vault!`);
  } catch (err) {
    console.error("❌ Failed to allocate/write to CDR Vault!");
    console.error(err);
    process.exit(1);
  }

  console.log("\n--- Starting Decryption Test (Keeper Bot Simulation) ---");
  
  try {
    console.log(`Requesting decryption for Vault ${uuid}...`);
    const { dataKey } = await cdrClient.consumer.accessCDR({
      uuid: Number(uuid),
      accessAuxData: "0x",
      timeoutMs: 120_000
    });

    const payloadString = new TextDecoder().decode(dataKey);
    const payload = JSON.parse(payloadString);
    console.log("✅ Decryption Successful!");
    console.log(`Decrypted Payload:`, payload);

  } catch (err) {
    console.error("❌ Decryption Failed!");
    console.error(err);
    process.exit(1);
  }

  console.log("\nEnd-to-End CDR Test Passed!");
}

main().catch(console.error);
