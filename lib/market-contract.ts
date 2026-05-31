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
    inputs: [{ internalType: "uint8", name: "assetIndex", type: "uint8" }],
    name: "markets",
    outputs: [
      { internalType: "enum ZeroSightMarket.MarketStatus", name: "status", type: "uint8" },
      { internalType: "enum ZeroSightMarket.MarketCategory", name: "category", type: "uint8" },
      { internalType: "uint256", name: "totalPool", type: "uint256" },
      { internalType: "uint256", name: "openedAt", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "openingPrice", type: "uint256" },
      { internalType: "uint256", name: "resolvedPrice", type: "uint256" },
      { internalType: "uint256", name: "winningChoice", type: "uint256" },
      { internalType: "uint256", name: "payoutPool", type: "uint256" },
      { internalType: "uint256", name: "winningSharesTotal", type: "uint256" },
      { internalType: "uint256", name: "distributionIndex", type: "uint256" }
    ],
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

export async function getMarketState(assetIndex: AssetIndex) {
  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    return { status: 2, totalPool: BigInt(0), openedAt: 0 }; // Default to resolved if no contract
  }

  const marketData = await publicClient.readContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: ZERO_SIGHT_MARKET_ABI,
    functionName: "markets",
    args: [assetIndex]
  }) as any;

  return {
    status: Number(marketData[0]),
    totalPool: marketData[2] as bigint,
    openedAt: Number(marketData[3]),
    deadline: Number(marketData[4]),
    openingPrice: Number(marketData[5])
  };
}
