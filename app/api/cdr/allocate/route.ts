import { NextResponse } from "next/server";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";
import { createWalletClient, createPublicClient, http, encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  OWNER_WRITE_CONDITION,
  OWNER_ADDRESS,
  STORY_API_URL,
  STORY_RPC_URL,
  STORY_TESTNET_CHAIN,
} from "../../../../lib/story";

export async function POST(req: Request) {
  try {
    const pk = process.env.DEPLOYER_PRIVATE_KEY;
    if (!pk) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing deployer key" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(pk as `0x${string}`);

    const publicClient = createPublicClient({
      chain: STORY_TESTNET_CHAIN,
      transport: http(STORY_RPC_URL),
    });

    const walletClient = createWalletClient({
      account,
      chain: STORY_TESTNET_CHAIN,
      transport: http(STORY_RPC_URL),
    });

    await initWasm();

    const cdrClient = new CDRClient({
      network: "testnet",
      publicClient,
      walletClient,
      apiUrl: STORY_API_URL,
    });

    // The backend admin wallet is the writer
    const writeConditionData = encodeAbiParameters([{ type: "address" }], [account.address]);

    console.log("Allocating gasless CDR vault...");
    const allocation = await cdrClient.uploader.allocate({
      updatable: false,
      writeConditionAddr: OWNER_WRITE_CONDITION,
      writeConditionData,
      readConditionAddr: OWNER_ADDRESS,
      readConditionData: "0x",
      skipConditionValidation: true,
    });

    console.log(`Vault allocated: ${allocation.uuid}`);

    return NextResponse.json({
      uuid: allocation.uuid.toString(),
      txHash: allocation.txHash,
    });
  } catch (error: any) {
    console.error("Error in /api/cdr/allocate:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
