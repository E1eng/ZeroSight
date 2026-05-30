import type { Chain } from "viem";

export const STORY_CHAIN_ID = Number(process.env.NEXT_PUBLIC_STORY_CHAIN_ID ?? 1517);
export const STORY_CAIP_ID = `eip155:${STORY_CHAIN_ID}`;

export const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC ?? "https://aeneid.storyrpc.io";
export const STORY_API_URL = process.env.NEXT_PUBLIC_STORY_API ?? "http://172.192.41.96:1317";

export const ZERO_SIGHT_MARKET_ADDRESS =
  (process.env.NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS as `0x${string}` | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const OWNER_ADDRESS =
  (process.env.NEXT_PUBLIC_OWNER_ADDRESS as `0x${string}` | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const SIGNER_CONDITION_ADDRESS = "0x4C9bFC96d7092b590D497A191826C3dA2277c34B" as const;

export const STORY_TESTNET_CHAIN: Chain = {
  id: STORY_CHAIN_ID,
  name: "Story Testnet (Aeneid)",
  nativeCurrency: {
    name: "Story Protocol Token",
    symbol: "IP",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [STORY_RPC_URL]
    },
    public: {
      http: [STORY_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "StoryScan",
      url: "https://storyscan.xyz/aeneid"
    }
  },
  testnet: true
};
