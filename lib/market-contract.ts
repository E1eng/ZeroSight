import { parseEther } from "viem";

import { createPrivyWalletClient, type PrivyWalletAdapter } from "./wallet";
import { ZERO_SIGHT_MARKET_ADDRESS } from "./story";
import type { AssetIndex } from "./markets";

const ZERO_SIGHT_MARKET_ABI = [
  {
    inputs: [
      { internalType: "string", name: "vaultId", type: "string" },
      { internalType: "uint8", name: "assetIndex", type: "uint8" }
    ],
    name: "placeBet",
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "marketStatus",
    outputs: [{ internalType: "enum ZeroSightMarket.MarketStatus", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalPool",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export async function placeBetOnChain(params: {
  wallet: PrivyWalletAdapter;
  vaultId: string;
  assetIndex: AssetIndex;
  amount: number;
}) {
  const { wallet, vaultId, assetIndex, amount } = params;

  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error("ZeroSight market contract address is not configured.");
  }

  if (amount <= 0) {
    throw new Error("Bet amount must be greater than zero.");
  }

  const walletClient = await createPrivyWalletClient(wallet);

  return walletClient.writeContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: ZERO_SIGHT_MARKET_ABI,
    functionName: "placeBet",
    args: [vaultId, assetIndex],
    value: parseEther(amount.toString())
  });
}

import { createPublicClient, http } from "viem";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL } from "./story";

const publicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

export async function getMarketState() {
  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    return { status: 2, totalPool: BigInt(0) }; // Default to resolved if no contract
  }

  const [status, totalPool] = await Promise.all([
    publicClient.readContract({
      address: ZERO_SIGHT_MARKET_ADDRESS,
      abi: ZERO_SIGHT_MARKET_ABI,
      functionName: "marketStatus"
    }),
    publicClient.readContract({
      address: ZERO_SIGHT_MARKET_ADDRESS,
      abi: ZERO_SIGHT_MARKET_ABI,
      functionName: "totalPool"
    })
  ]);

  return {
    status: Number(status),
    totalPool: totalPool as unknown as bigint
  };
}
