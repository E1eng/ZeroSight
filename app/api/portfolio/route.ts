export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";

import { MARKET_ABI } from "@/lib/abi";
import { STORY_RPC_URL, STORY_TESTNET_CHAIN, ZERO_SIGHT_MARKET_ADDRESS } from "@/lib/story";

const publicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

const ASSET_NAMES: Record<number, string> = {
  0: "IP (Hourly)",
  1: "BTC (Hourly)",
  2: "ETH (Hourly)",
  3: "IP (Daily)",
  4: "BTC (Daily)",
  5: "ETH (Daily)"
};

function isValidAddress(addr: string): addr is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Pick named events from the central ABI so we never drift. */
const BetPlacedEvent = MARKET_ABI.find((x) => x.type === "event" && x.name === "BetPlaced")!;
const WinningsDistributedEvent = MARKET_ABI.find(
  (x) => x.type === "event" && x.name === "WinningsDistributed"
)!;
const BetRefundedEvent = MARKET_ABI.find((x) => x.type === "event" && x.name === "BetRefunded")!;
const MarketResolvedEvent = MARKET_ABI.find(
  (x) => x.type === "event" && x.name === "MarketResolved"
)!;

interface BetEntry {
  txHash: string;
  blockNumber: number;
  assetIndex: number;
  assetName: string;
  vaultId: string;
  roundId: string;
  amount: string;
  status: "won" | "lost" | "refunded" | "pending";
  payout: string;
  /** Choice deduced from event data when possible. Always "🔒 Encrypted" for pending. */
  choice: string;
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
    return NextResponse.json({ bets: [], summary: emptySummary() });
  }

  try {
    const [betLogs, winLogs, refundLogs, resolvedLogs] = await Promise.all([
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: BetPlacedEvent as any,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      }),
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: WinningsDistributedEvent as any,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      }),
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: BetRefundedEvent as any,
        args: { bettor: address as `0x${string}` },
        fromBlock: "earliest",
        toBlock: "latest"
      }),
      publicClient.getLogs({
        address: ZERO_SIGHT_MARKET_ADDRESS as `0x${string}`,
        event: MarketResolvedEvent as any,
        fromBlock: "earliest",
        toBlock: "latest"
      })
    ]);

    // ── Index winnings & refunds by vaultId (V2 emits vaultId on these). ──
    const winByVault = new Map<string, { amount: bigint; choice: number }>();
    const winByAssetRound = new Map<string, { amount: bigint; choice: number }>();
    for (const log of winLogs) {
      const v = String(log.args.vaultId ?? "");
      const amt = (log.args.amount as bigint) ?? 0n;
      if (v) winByVault.set(v, { amount: amt, choice: -1 });
      const k = `${log.args.assetIndex}-${log.args.roundId}`;
      const prev = winByAssetRound.get(k);
      winByAssetRound.set(k, { amount: (prev?.amount ?? 0n) + amt, choice: -1 });
    }

    const refundByVault = new Map<string, bigint>();
    for (const log of refundLogs) {
      const v = String(log.args.vaultId ?? "");
      const amt = (log.args.amount as bigint) ?? 0n;
      if (v) refundByVault.set(v, amt);
    }

    // Resolved markets indexed by (assetIndex, roundId) so we can flag a bet
    // as Lost only if its specific round resolved.
    const resolvedByAssetRound = new Map<string, { winningChoice: number }>();
    for (const log of resolvedLogs) {
      const k = `${log.args.assetIndex}-${log.args.roundId}`;
      resolvedByAssetRound.set(k, { winningChoice: Number(log.args.winningChoice ?? 0) });
    }

    // ── Build bet entries with deterministic outcome correlation. ──
    const bets: BetEntry[] = betLogs.map((log) => {
      const assetIndex = Number(log.args.assetIndex ?? 0);
      const roundId = String(log.args.roundId ?? "0");
      const vaultId = String(log.args.vaultId ?? "");
      const amount = (log.args.amount ?? 0n) as bigint;

      const win = winByVault.get(vaultId);
      const refund = refundByVault.get(vaultId);
      const resolved = resolvedByAssetRound.get(`${assetIndex}-${roundId}`);

      let status: BetEntry["status"] = "pending";
      let payout = "—";
      let choice = "🔒 Encrypted";

      if (refund !== undefined) {
        status = "refunded";
        payout = `↩ ${refund.toString()}`;
        choice = "⚠️ Decrypt failed";
      } else if (win !== undefined) {
        status = "won";
        payout = `+${win.amount.toString()}`;
        if (resolved) {
          choice = resolved.winningChoice === 1 ? "⬆️ Up" : "⬇️ Down";
        }
      } else if (resolved) {
        // Round resolved, no win/refund event for this vault → user lost.
        status = "lost";
        payout = `-${amount.toString()}`;
        choice = resolved.winningChoice === 1 ? "⬇️ Down" : "⬆️ Up";
      }

      return {
        txHash: log.transactionHash ?? "",
        blockNumber: Number(log.blockNumber ?? 0),
        assetIndex,
        assetName: ASSET_NAMES[assetIndex] ?? "Unknown",
        vaultId,
        roundId,
        amount: amount.toString(),
        status,
        payout,
        choice
      };
    });

    // Most recent first.
    bets.sort((a, b) => b.blockNumber - a.blockNumber);

    const totalWagered = bets.reduce((s, b) => s + BigInt(b.amount), 0n);
    const totalWon = winLogs.reduce((s, l) => s + ((l.args.amount as bigint) ?? 0n), 0n);
    const totalRefunded = refundLogs.reduce((s, l) => s + ((l.args.amount as bigint) ?? 0n), 0n);

    return NextResponse.json({
      bets,
      summary: {
        totalBets: bets.length,
        totalWagered: totalWagered.toString(),
        totalWon: totalWon.toString(),
        totalRefunded: totalRefunded.toString()
      }
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 });
  }
}

function emptySummary() {
  return { totalBets: 0, totalWagered: "0", totalWon: "0", totalRefunded: "0" };
}
