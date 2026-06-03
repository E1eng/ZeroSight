import { createPublicClient, http, parseEther } from "viem";

import { MARKET_ABI } from "./abi";
import { createPrivyWalletClient, type PrivyWalletAdapter } from "./wallet";
import { STORY_RPC_URL, STORY_TESTNET_CHAIN, ZERO_SIGHT_MARKET_ADDRESS } from "./story";
import type { AssetIndex } from "./markets";

function ensureContract() {
  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error("ZeroSight market contract address is not configured.");
  }
}

const publicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

export async function placeBetOnChain(params: {
  wallet: PrivyWalletAdapter;
  vaultId: string;
  assetIndex: AssetIndex;
  amount: number;
}) {
  const { wallet, vaultId, assetIndex, amount } = params;
  ensureContract();
  if (amount <= 0) throw new Error("Bet amount must be greater than zero.");

  const walletClient = await createPrivyWalletClient(wallet);

  const hash = await walletClient.writeContract({
    address: ZERO_SIGHT_MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "placeBet",
    args: [vaultId, assetIndex],
    value: parseEther(amount.toString())
  });

  // Wait for the receipt and confirm it didn't revert. Without this, a bet
  // submitted right at the lock boundary reverts on-chain but the caller would
  // still treat it as placed (and add it to local history). A reverted tx
  // throws here so the UI can surface the failure and skip recording it.
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on-chain — the market may have just closed.");
  }

  return hash;
}

export interface MarketState {
  status: 0 | 1 | 2;
  totalPool: bigint;
  openedAt: number;
  deadline: number;
  openingPrice: number;
  resolvedPrice: number;
  winningChoice: number;
  payoutPool: bigint;
  winningSharesTotal: bigint;
  distributionIndex: bigint;
  currentRoundId: bigint;
}

export async function getMarketState(assetIndex: AssetIndex): Promise<MarketState> {
  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    return {
      status: 2,
      totalPool: 0n,
      openedAt: 0,
      deadline: 0,
      openingPrice: 0,
      resolvedPrice: 0,
      winningChoice: 0,
      payoutPool: 0n,
      winningSharesTotal: 0n,
      distributionIndex: 0n,
      currentRoundId: 0n
    };
  }

  const [m, currentRoundId] = await Promise.all([
    publicClient.readContract({
      address: ZERO_SIGHT_MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "markets",
      args: [assetIndex]
    }),
    publicClient.readContract({
      address: ZERO_SIGHT_MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "currentRoundId",
      args: [assetIndex]
    })
  ]);

  // viem v2 returns multi-output as positional array regardless of names. Some
  // versions also expose named accessors on the same object — read both ways
  // defensively so we never silently fall back to status=2 (Resolved).
  const r = m as any;
  const pickN = (idx: number, name: string) => {
    if (Array.isArray(r) && r[idx] !== undefined) return r[idx];
    if (r != null && r[name] !== undefined) return r[name];
    return undefined;
  };

  const statusRaw = pickN(0, "status");
  const totalPoolRaw = pickN(2, "totalPool");
  const openedAtRaw = pickN(3, "openedAt");
  const deadlineRaw = pickN(4, "deadline");
  const openingPriceRaw = pickN(5, "openingPrice");
  const resolvedPriceRaw = pickN(6, "resolvedPrice");
  const winningChoiceRaw = pickN(7, "winningChoice");
  const payoutPoolRaw = pickN(8, "payoutPool");
  const winningSharesRaw = pickN(9, "winningSharesTotal");
  const distributionIdxRaw = pickN(10, "distributionIndex");

  return {
    status: Number(statusRaw ?? 0) as 0 | 1 | 2,
    totalPool: BigInt(totalPoolRaw ?? 0),
    openedAt: Number(openedAtRaw ?? 0),
    deadline: Number(deadlineRaw ?? 0),
    openingPrice: Number(openingPriceRaw ?? 0),
    resolvedPrice: Number(resolvedPriceRaw ?? 0),
    winningChoice: Number(winningChoiceRaw ?? 0),
    payoutPool: BigInt(payoutPoolRaw ?? 0),
    winningSharesTotal: BigInt(winningSharesRaw ?? 0),
    distributionIndex: BigInt(distributionIdxRaw ?? 0),
    currentRoundId: BigInt((currentRoundId as any) ?? 0)
  };
}
