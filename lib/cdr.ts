import { CDRClient, initWasm, uuidToLabel } from "@piplabs/cdr-sdk";
import { createPublicClient, encodeAbiParameters, http, toHex } from "viem";

import {
  OWNER_WRITE_CONDITION,
  OWNER_ADDRESS,
  STORY_API_URL,
  STORY_RPC_URL,
  STORY_TESTNET_CHAIN
} from "./story";
import { createPrivyWalletClient, type PrivyWalletAdapter } from "./wallet";

const wasmState: { promise: Promise<void> | null } = { promise: null };

async function ensureCdrWasm() {
  if (!wasmState.promise) {
    wasmState.promise = initWasm().catch((error) => {
      wasmState.promise = null;
      throw error;
    });
  }
  await wasmState.promise;
}

export async function createCdrClient(wallet?: PrivyWalletAdapter) {
  await ensureCdrWasm();

  const publicClient = createPublicClient({
    chain: STORY_TESTNET_CHAIN,
    transport: http(STORY_RPC_URL)
  });

  if (!wallet) {
    return new CDRClient({
      network: "testnet",
      publicClient,
      apiUrl: STORY_API_URL
    });
  }

  const walletClient = await createPrivyWalletClient(wallet);

  return new CDRClient({
    network: "testnet",
    publicClient,
    walletClient,
    apiUrl: STORY_API_URL
  });
}

export async function encryptPayload(params: {
  client: CDRClient;
  walletAddress: `0x${string}`;
  payload: Uint8Array;
}) {
  const { client, walletAddress, payload } = params;

  // Owner-only: writer must match wallet, reads gated to same EOA (skip contract validation).
  const writeConditionData = encodeAbiParameters([{ type: "address" }], [walletAddress]);

  const allocation = await client.uploader.allocate({
    updatable: false,
    writeConditionAddr: OWNER_WRITE_CONDITION,
    writeConditionData,
    readConditionAddr: OWNER_ADDRESS,
    readConditionData: "0x",
    skipConditionValidation: true
  });

  const globalPubKey = await client.observer.getGlobalPubKey();
  const label = uuidToLabel(allocation.uuid);

  const ciphertext = await client.uploader.encryptDataKey({
    dataKey: payload,
    globalPubKey,
    label
  });

  await client.uploader.write({
    uuid: allocation.uuid,
    accessAuxData: "0x",
    encryptedData: toHex(ciphertext.raw)
  });

  return {
    uuid: allocation.uuid,
    txHash: allocation.txHash
  };
}
