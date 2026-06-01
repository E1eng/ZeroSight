import type { Chain } from "viem";

/**
 * Centralised env reads. Next.js client bundles ONLY inline `process.env.LITERAL`
 * — dynamic indexing (`process.env[name]`) returns `undefined` in the browser.
 * Therefore every NEXT_PUBLIC_* variable must be referenced literally below.
 */

const NEXT_PUBLIC_STORY_CHAIN_ID = process.env.NEXT_PUBLIC_STORY_CHAIN_ID;
const NEXT_PUBLIC_STORY_RPC = process.env.NEXT_PUBLIC_STORY_RPC;
const NEXT_PUBLIC_STORY_API = process.env.NEXT_PUBLIC_STORY_API;
const NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS =
  process.env.NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS;
const NEXT_PUBLIC_OWNER_ADDRESS = process.env.NEXT_PUBLIC_OWNER_ADDRESS;

// Server-only fallbacks (these never reach the browser bundle).
const SERVER_STORY_CHAIN_ID = process.env.STORY_CHAIN_ID;
const SERVER_STORY_RPC_URL = process.env.STORY_RPC_URL;
const SERVER_STORY_API_URL = process.env.STORY_API_URL;

function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v && v.length > 0) return v;
  return undefined;
}

export const STORY_CHAIN_ID = Number(
  firstNonEmpty(NEXT_PUBLIC_STORY_CHAIN_ID, SERVER_STORY_CHAIN_ID) ?? 1315
);

export const STORY_CAIP_ID = `eip155:${STORY_CHAIN_ID}`;

export const STORY_RPC_URL =
  firstNonEmpty(NEXT_PUBLIC_STORY_RPC, SERVER_STORY_RPC_URL) ??
  "https://aeneid.storyrpc.io";

export const STORY_API_URL =
  firstNonEmpty(NEXT_PUBLIC_STORY_API, SERVER_STORY_API_URL) ??
  "http://172.192.41.96:1317";

export const ZERO_SIGHT_MARKET_ADDRESS =
  (NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS as `0x${string}` | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const OWNER_ADDRESS =
  (NEXT_PUBLIC_OWNER_ADDRESS as `0x${string}` | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const OWNER_WRITE_CONDITION =
  "0x4C9bFC96d7092b590D497A191826C3dA2277c34B" as const;

export const STORY_TESTNET_CHAIN: Chain = {
  id: STORY_CHAIN_ID,
  name: "Story Testnet (Aeneid)",
  nativeCurrency: { name: "Story Protocol Token", symbol: "IP", decimals: 18 },
  rpcUrls: {
    default: { http: [STORY_RPC_URL] },
    public: { http: [STORY_RPC_URL] }
  },
  blockExplorers: {
    default: { name: "StoryScan", url: "https://aeneid.storyscan.xyz" }
  },
  testnet: true
};
