import { NextResponse } from "next/server";
import { CDRClient } from "@piplabs/cdr-sdk";
import { createPublicClient, http, toHex } from "viem";

import { STORY_API_URL, STORY_RPC_URL, STORY_TESTNET_CHAIN } from "../../../../lib/story";

// The CDR DKG global public key lives behind the Story-API REST endpoint, which
// is plain HTTP. A browser on https:// can't fetch it (mixed content), so the
// SDK's client-side `observer.getGlobalPubKey()` fails during encryption.
// This server route fetches it (server can call HTTP) and returns it as hex so
// the browser can encrypt locally without ever touching the insecure origin.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publicClient = createPublicClient({
      chain: STORY_TESTNET_CHAIN,
      transport: http(STORY_RPC_URL),
    });

    const client = new CDRClient({
      network: "testnet",
      publicClient,
      apiUrl: STORY_API_URL,
    });

    const pubKey = await client.observer.getGlobalPubKey();

    return NextResponse.json(
      { globalPubKeyHex: toHex(pubKey) },
      // Pubkey changes only on DKG rollover; let the CDN cache it briefly to
      // cut function calls while staying fresh enough.
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } }
    );
  } catch (error: any) {
    console.error("Error in /api/cdr/pubkey:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
