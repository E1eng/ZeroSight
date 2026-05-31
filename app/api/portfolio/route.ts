import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { STORY_TESTNET_CHAIN, STORY_RPC_URL, ZERO_SIGHT_MARKET_ADDRESS } from "@/lib/story";

const publicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

const BET_PLACED_EVENT = parseAbiItem(
  "event BetPlaced(address indexed bettor, string vaultId, uint8 assetIndex, uint256 amount)"
);
const WINNINGS_DISTRIBUTED_EVENT = parseAbiItem(
  "event WinningsDistributed(uint8 indexed assetIndex, address indexed bettor, uint256 amount)"
);
const BET_REFUNDED_EVENT = parseAbiItem(
  "event BetRefunded(uint8 indexed assetIndex, address indexed bettor, uint256 amount)"
);

const ASSET_NAMES: Record<number, string> = {
  0: "IP (Hourly)",
  1: "BTC (Hourly)",
  2: "ETH (Hourly)",
  3: "IP (Daily)",
  4: "BTC (Daily)",
  5: "ETH (Daily)"
};

// Simple address validation: must be a 0x-prefixed hex string of 42 chars
function isValidAddress(addr: string): addr is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
  }

  if (
    !ZERO_SIGHT_MARKET_ADDRESS ||
    ZERO_SIGHT_MARKET_ADDRESS === "0x0000000000000000000000000000000000000000"
  ) {
    return NextResponse.json({ bets: [], winnings: [], refunds: [] });
  }

  try {
    // Fetch all three event types in parallel
    const [betLogs, winLogs, refundLogs] = await Promise.all([
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: BET_PLACED_EVENT,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      }),
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: WINNINGS_DISTRIBUTED_EVENT,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      }),
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: BET_REFUNDED_EVENT,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      })
    ]);

    // Build a set of (blockNumber, txHash) for winnings and refunds for cross-referencing
    const winMap = new Map<string, bigint>();
    for (const log of winLogs) {
      const key = `${log.args.assetIndex}-${log.blockNumber}`;
      winMap.set(key, (winMap.get(key) ?? BigInt(0)) + (log.args.amount ?? BigInt(0)));
    }

    const refundSet = new Set<string>();
    const refundAmounts = new Map<string, bigint>();
    for (const log of refundLogs) {
      const key = `${log.args.assetIndex}-${log.blockNumber}`;
      refundSet.add(key);
      refundAmounts.set(key, (refundAmounts.get(key) ?? BigInt(0)) + (log.args.amount ?? BigInt(0)));
    }

    // Build bets list with enriched data
    const bets = betLogs.map((log) => ({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      assetIndex: log.args.assetIndex ?? 0,
      assetName: ASSET_NAMES[log.args.assetIndex ?? 0] ?? "Unknown",
      vaultId: log.args.vaultId ?? "",
      amount: (log.args.amount ?? BigInt(0)).toString()
    }));

    const winnings = winLogs.map((log) => ({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      assetIndex: log.args.assetIndex ?? 0,
      assetName: ASSET_NAMES[log.args.assetIndex ?? 0] ?? "Unknown",
      amount: (log.args.amount ?? BigInt(0)).toString()
    }));

    const refunds = refundLogs.map((log) => ({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      assetIndex: log.args.assetIndex ?? 0,
      assetName: ASSET_NAMES[log.args.assetIndex ?? 0] ?? "Unknown",
      amount: (log.args.amount ?? BigInt(0)).toString()
    }));

    return NextResponse.json({
      bets,
      winnings,
      refunds,
      summary: {
        totalBets: bets.length,
        totalWagered: bets.reduce((sum, b) => sum + BigInt(b.amount), BigInt(0)).toString(),
        totalWon: winnings.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0)).toString(),
        totalRefunded: refunds.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)).toString()
      }
    });
  } catch (err) {
    // Generic error message; no sensitive data exposed
    return NextResponse.json(
      { error: "Failed to fetch portfolio data" },
      { status: 500 }
    );
  }
}
