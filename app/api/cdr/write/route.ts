import { NextResponse } from "next/server";
import { CDRClient, initWasm } from "@piplabs/cdr-sdk";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  STORY_API_URL,
  STORY_RPC_URL,
  STORY_TESTNET_CHAIN,
} from "../../../../lib/story";

export async function POST(req: Request) {
  try {
    const { uuid, encryptedDataHex } = await req.json();

    if (!uuid || !encryptedDataHex) {
      return NextResponse.json(
        { error: "Missing uuid or encryptedDataHex" },
        { status: 400 }
      );
    }

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

    console.log(`Writing to gasless CDR vault ${uuid}...`);
    const writeResult = await cdrClient.uploader.write({
      uuid: Number(uuid),
      accessAuxData: "0x",
      encryptedData: encryptedDataHex,
    });

    console.log(`Vault ${uuid} written successfully!`);

    return NextResponse.json({
      txHash: writeResult.txHash,
    });
  } catch (error: any) {
    console.error("Error in /api/cdr/write:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
