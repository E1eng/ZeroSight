import { CDRClient, initWasm, uuidToLabel } from "@piplabs/cdr-sdk";
import { createPublicClient, encodeAbiParameters, hexToBytes, http, toHex } from "viem";

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
  const { client, payload } = params;

  // 1. Call Backend API to Allocate Vault (Gasless)
  const allocRes = await fetch("/api/cdr/allocate", {
    method: "POST",
  });
  if (!allocRes.ok) {
    throw new Error(`Failed to allocate vault: ${await allocRes.text()}`);
  }
  const { uuid, txHash: allocateTx } = await allocRes.json();

  // 2. Encrypt locally in browser using the UUID label.
  //    uuidToLabel expects a JS number (it writes a 4-byte big-endian uint32),
  //    NOT a BigInt — passing BigInt throws "Cannot convert a BigInt value to a number".
  //
  //    The DKG global public key is fetched from OUR https route, not directly
  //    from the SDK's observer — the Story-API REST endpoint is plain HTTP, and
  //    a browser on https:// would have its getGlobalPubKey() call blocked as
  //    mixed content. The server route proxies it over HTTPS for us.
  const pkRes = await fetch("/api/cdr/pubkey");
  if (!pkRes.ok) {
    throw new Error(`Failed to fetch CDR public key: ${await pkRes.text()}`);
  }
  const { globalPubKeyHex } = await pkRes.json();
  const globalPubKey = hexToBytes(globalPubKeyHex as `0x${string}`);

  const uuidNum = Number(uuid);
  if (!Number.isSafeInteger(uuidNum) || uuidNum < 0 || uuidNum > 0xffffffff) {
    throw new Error(`Vault uuid ${uuid} out of uint32 range for label derivation`);
  }
  const label = uuidToLabel(uuidNum);

  const ciphertext = await client.uploader.encryptDataKey({
    dataKey: payload,
    globalPubKey,
    label
  });

  // 3. Call Backend API to Write to Vault (Gasless)
  const writeRes = await fetch("/api/cdr/write", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uuid,
      encryptedDataHex: toHex(ciphertext.raw)
    })
  });
  if (!writeRes.ok) {
    throw new Error(`Failed to write to vault: ${await writeRes.text()}`);
  }
  
  return {
    uuid,
    txHash: allocateTx
  };
}
