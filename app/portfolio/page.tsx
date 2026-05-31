"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { formatEther } from "viem";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────
interface BetEntry {
  txHash: string;
  blockNumber: number;
  assetIndex: number;
  assetName: string;
  vaultId: string;
  amount: string;
}

interface WinEntry {
  txHash: string;
  blockNumber: number;
  assetIndex: number;
  assetName: string;
  amount: string;
}

interface PortfolioSummary {
  totalBets: number;
  totalWagered: string;
  totalWon: string;
  totalRefunded: string;
}

interface PortfolioData {
  bets: BetEntry[];
  winnings: WinEntry[];
  refunds: WinEntry[];
  summary: PortfolioSummary;
}

// ─── Asset icons ─────────────────────────────────────────────────
const ASSET_ICONS: Record<number, string> = {
  0: "🟣", 1: "🟠", 2: "🔵", 3: "🟣", 4: "🟠", 5: "🔵"
};

// ─── Helpers ─────────────────────────────────────────────────────
function shortenHash(hash: string): string {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatIP(wei: string): string {
  try {
    const val = Number(formatEther(BigInt(wei)));
    return val.toFixed(val < 0.01 ? 6 : 4);
  } catch {
    return "0";
  }
}

// ─── Status Badge Component ──────────────────────────────────────
function StatusBadge({ status }: { status: "won" | "lost" | "refunded" | "pending" }) {
  const styles: Record<string, string> = {
    won: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    lost: "bg-red-500/15 text-red-400 border-red-500/30",
    refunded: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  };

  const labels: Record<string, string> = {
    won: "🏆 Won",
    lost: "❌ Lost",
    refunded: "↩️ Refunded",
    pending: "⏳ Pending"
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-white/10 hover:shadow-lg hover:shadow-white/[0.02]">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`relative mt-2 text-2xl font-bold tracking-tight ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function PortfolioPage() {
  const { authenticated, login, ready } = usePrivy();
  const { wallets } = useWallets();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const walletAddress = wallets?.[0]?.address;

  const fetchPortfolio = useCallback(async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/portfolio?address=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) throw new Error("Failed to load portfolio");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Failed to load portfolio data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      fetchPortfolio();
    }
  }, [walletAddress, fetchPortfolio]);

  // Build enriched bet list with outcome status
  const enrichedBets = data
    ? data.bets.map((bet) => {
        // Check if this bet has a matching winning or refund event
        const hasWin = data.winnings.some(
          (w) => w.assetIndex === bet.assetIndex && w.blockNumber > bet.blockNumber
        );
        const hasRefund = data.refunds.some(
          (r) => r.assetIndex === bet.assetIndex && r.blockNumber > bet.blockNumber
        );

        let status: "won" | "lost" | "refunded" | "pending" = "pending";
        let payout = "—";

        if (hasWin) {
          // Find the matching win entry
          const winEntry = data.winnings.find(
            (w) => w.assetIndex === bet.assetIndex && w.blockNumber > bet.blockNumber
          );
          status = "won";
          payout = winEntry ? `+${formatIP(winEntry.amount)} IP` : "—";
        } else if (hasRefund) {
          status = "refunded";
          payout = `↩ ${formatIP(bet.amount)} IP`;
        } else if (data.winnings.length > 0 || data.refunds.length > 0) {
          // If there are outcomes for this asset but none matching this bet, it's a loss
          status = "lost";
          payout = `-${formatIP(bet.amount)} IP`;
        }

        return { ...bet, status, payout };
      }).reverse() // Most recent first
    : [];

  const totalWagered = data ? formatIP(data.summary.totalWagered) : "0";
  const totalWon = data ? formatIP(data.summary.totalWon) : "0";
  const totalRefunded = data ? formatIP(data.summary.totalRefunded) : "0";
  const netPnL = data
    ? formatIP(
        (BigInt(data.summary.totalWon) + BigInt(data.summary.totalRefunded) - BigInt(data.summary.totalWagered)).toString()
      )
    : "0";
  const isPositivePnL = data
    ? BigInt(data.summary.totalWon) + BigInt(data.summary.totalRefunded) >= BigInt(data.summary.totalWagered)
    : false;

  // ─── Not Connected State ─────────────────────────────────────
  if (ready && !authenticated) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-12 text-center">
          <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-neon/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-electric/5 blur-3xl" />

          <div className="relative">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 text-4xl">
              📊
            </div>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">Connect Your Wallet</h2>
            <p className="mb-8 text-sm text-zinc-500">
              View your betting history, outcomes, and P&L across all markets.
            </p>
            <button
              onClick={login}
              className="rounded-2xl bg-neon px-8 py-4 text-lg font-bold text-black transition hover:bg-neon/90"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col px-6 py-8 lg:px-12">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-zinc-100">PORTFOLIO</h1>
          {walletAddress && (
            <p className="mt-1 text-sm text-zinc-500">
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </p>
          )}
        </div>
        <button
          onClick={fetchPortfolio}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
        >
          <span className={loading ? "animate-spin" : ""}>↻</span> Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Bets" value={data?.summary.totalBets.toString() ?? "—"} />
        <StatCard label="Total Wagered" value={`${totalWagered} IP`} />
        <StatCard label="Total Won" value={`${totalWon} IP`} accent="text-emerald-400" />
        <StatCard
          label="Net P&L"
          value={`${isPositivePnL ? "+" : ""}${netPnL} IP`}
          accent={isPositivePnL ? "text-emerald-400" : "text-red-400"}
        />
      </div>

      {/* Legend */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <StatusBadge status="won" />
        <StatusBadge status="lost" />
        <StatusBadge status="refunded" />
        <StatusBadge status="pending" />
        {data && data.summary.totalRefunded !== "0" && (
          <span className="ml-auto text-xs text-amber-400/70">
            ↩️ Refunded = CDR decrypt failed, full amount returned
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-neon" />
        </div>
      )}

      {/* Bet History Table */}
      {!loading && data && (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
                  <th className="px-6 py-4">Market</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Vault ID</th>
                  <th className="px-6 py-4">Outcome</th>
                  <th className="px-6 py-4">Payout</th>
                  <th className="px-6 py-4">Tx</th>
                </tr>
              </thead>
              <tbody>
                {enrichedBets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-zinc-500">
                      <div className="text-3xl mb-2">🎯</div>
                      No bets yet. <Link href="/" className="text-neon hover:underline">Place your first bet!</Link>
                    </td>
                  </tr>
                ) : (
                  enrichedBets.map((bet, i) => (
                    <tr
                      key={`${bet.txHash}-${i}`}
                      className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{ASSET_ICONS[bet.assetIndex] ?? "⚪"}</span>
                          <span className="font-semibold text-zinc-200">{bet.assetName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-zinc-200">
                        {formatIP(bet.amount)} IP
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-500">
                        #{bet.vaultId}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={bet.status} />
                      </td>
                      <td className={`px-6 py-4 font-mono font-semibold ${
                        bet.status === "won" ? "text-emerald-400" :
                        bet.status === "refunded" ? "text-amber-400" :
                        bet.status === "lost" ? "text-red-400" : "text-zinc-500"
                      }`}>
                        {bet.payout}
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`https://aeneid.storyscan.xyz/tx/${bet.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-electric hover:text-electric/80 transition"
                        >
                          {shortenHash(bet.txHash)}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="flex flex-col gap-3 p-4 lg:hidden">
            {enrichedBets.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <div className="text-3xl mb-2">🎯</div>
                No bets yet. <Link href="/" className="text-neon hover:underline">Place your first bet!</Link>
              </div>
            ) : (
              enrichedBets.map((bet, i) => (
                <div
                  key={`${bet.txHash}-${i}`}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ASSET_ICONS[bet.assetIndex] ?? "⚪"}</span>
                      <span className="font-semibold text-zinc-200">{bet.assetName}</span>
                    </div>
                    <StatusBadge status={bet.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-500">Amount</span>
                      <p className="font-mono font-semibold text-zinc-200">{formatIP(bet.amount)} IP</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Payout</span>
                      <p className={`font-mono font-semibold ${
                        bet.status === "won" ? "text-emerald-400" :
                        bet.status === "refunded" ? "text-amber-400" :
                        bet.status === "lost" ? "text-red-400" : "text-zinc-500"
                      }`}>{bet.payout}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Vault</span>
                      <p className="font-mono text-zinc-400">#{bet.vaultId}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Tx</span>
                      <p>
                        <a
                          href={`https://aeneid.storyscan.xyz/tx/${bet.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-electric hover:text-electric/80 transition"
                        >
                          {shortenHash(bet.txHash)}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Refund Info Banner */}
      {data && data.refunds.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl">ℹ️</span>
            <div className="text-sm text-amber-300/80">
              <p className="font-semibold text-amber-300 mb-1">
                About Refunded Bets
              </p>
              <p>
                Bets are refunded when the encrypted choice could not be decrypted by the keeper bot
                (CDR infrastructure issue). Your full bet amount is automatically returned by the smart
                contract during distribution — no fees are deducted.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
