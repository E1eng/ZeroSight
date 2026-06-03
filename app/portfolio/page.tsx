"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import Link from "next/link";

import { useBets } from "@/hooks/use-bets";
import { AssetIcon } from "@/components/asset-icon";

// ─── Types ───────────────────────────────────────────────────────
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
  choice: string;
}

interface PortfolioData {
  bets: BetEntry[];
  summary: {
    totalBets: number;
    totalWagered: string;
    totalWon: string;
    totalRefunded: string;
  };
}

const ASSET_SYMBOL: Record<number, string> = {
  0: "IP",
  1: "BTC",
  2: "ETH",
  3: "IP",
  4: "BTC",
  5: "ETH"
};

function shortenHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatIP(wei: string) {
  try {
    const sign = wei.startsWith("-") ? "-" : wei.startsWith("+") ? "+" : "";
    // NOTE: '-' must be escaped/last in the class, otherwise '+-↩' is parsed as
    // a char RANGE that also matches all digits — which silently stripped the
    // whole number and made amounts render as raw wei.
    const stripped = wei.replace(/^[+\-↩\s]+/, "");
    if (!stripped) return wei;
    const val = Number(formatEther(BigInt(stripped)));
    const str = val.toFixed(val < 0.01 ? 6 : 4);
    return sign ? `${sign}${str}` : str;
  } catch {
    return wei;
  }
}

function StatusBadge({ status }: { status: BetEntry["status"] }) {
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
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

export default function PortfolioPage() {
  const { authenticated, login, ready } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = wallets?.[0]?.address;
  const { localBets } = useBets(walletAddress);

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch
  } = useQuery<PortfolioData>({
    queryKey: ["portfolio", walletAddress],
    enabled: Boolean(walletAddress),
    // Keep showing the last good data while refetching so the table never
    // blanks out or flips bets back to "pending" mid-refresh.
    placeholderData: (prev) => prev,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const res = await fetch(`/api/portfolio?address=${encodeURIComponent(walletAddress!)}`);
      if (!res.ok) throw new Error("Failed to load portfolio");
      return res.json();
    }
  });

  const loading = isLoading; // only the very first load shows the full spinner
  const error = queryError ? "Failed to load portfolio data. Please try again." : "";
  const fetchPortfolio = refetch;

  // Merge local pending bets (placed but not yet indexed by chain getLogs)
  // with server-correlated bets. Dedup by vaultId.
  const allBets = useMemo(() => {
    if (!data) return [] as BetEntry[];
    const knownVaults = new Set(data.bets.map((b) => b.vaultId));
    const knownTx = new Set(data.bets.map((b) => b.txHash.toLowerCase()));
    const PENDING_TTL_MS = 30 * 60 * 1000; // drop stale pending entries after 30m
    const now = Date.now();

    // Map vaultId -> own choice from localStorage. We always know OUR OWN pick,
    // so it's safe to surface it even while the market is still blind to others.
    const localChoiceByVault = new Map<string, number>();
    for (const lb of localBets) localChoiceByVault.set(lb.vaultId, lb.direction);

    const pending: BetEntry[] = localBets
      .filter((lb) => {
        if (knownVaults.has(lb.vaultId)) return false;
        if (lb.txHash && knownTx.has(lb.txHash.toLowerCase())) return false;
        if (lb.placedAt && now - lb.placedAt > PENDING_TTL_MS) return false;
        return true;
      })
      .map((lb) => {
        let amountWei = "0";
        try {
          // parseEther avoids float precision loss (0.11 * 1e18 != exact).
          amountWei = parseEther(String(lb.amount)).toString();
        } catch {
          amountWei = "0";
        }
        return {
          txHash: lb.txHash,
          blockNumber: 0,
          assetIndex: 0,
          assetName: lb.market.toUpperCase(),
          vaultId: lb.vaultId,
          roundId: "?",
          amount: amountWei,
          status: "pending" as const,
          payout: "—",
          choice: lb.direction === 1 ? "⬆️ Up" : "⬇️ Down"
        };
      });
    // Local pending bets first (most recent action), then server data.
    return [...pending, ...data.bets].map((bet) => {
      // For bets still showing the blind placeholder, fill in the owner's real
      // choice from localStorage so the user sees their own pick immediately.
      if (bet.choice === "🔒 Encrypted") {
        const dir = localChoiceByVault.get(bet.vaultId);
        if (dir === 1) return { ...bet, choice: "⬆️ Up" };
        if (dir === 0) return { ...bet, choice: "⬇️ Down" };
      }
      return bet;
    });
  }, [data, localBets]);

  const totalWagered = data ? formatIP(data.summary.totalWagered) : "0";
  const totalWon = data ? formatIP(data.summary.totalWon) : "0";
  const totalRefunded = data ? formatIP(data.summary.totalRefunded) : "0";
  const netPnL = data
    ? formatIP(
        (
          BigInt(data.summary.totalWon) +
          BigInt(data.summary.totalRefunded) -
          BigInt(data.summary.totalWagered)
        ).toString()
      )
    : "0";
  const isPositivePnL = data
    ? BigInt(data.summary.totalWon) + BigInt(data.summary.totalRefunded) >=
      BigInt(data.summary.totalWagered)
    : false;

  // ── Not authenticated ────────────────────────────────────────
  if (ready && !authenticated) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-12 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 text-4xl">
            📊
          </div>
          <h2 className="mb-3 text-2xl font-bold text-zinc-100">Connect Your Wallet</h2>
          <p className="mb-8 text-sm text-zinc-500">
            View your betting history, outcomes, and P&amp;L across all markets.
          </p>
          <button
            onClick={login}
            className="rounded-2xl bg-neon px-8 py-4 text-lg font-bold text-black transition hover:bg-neon/90"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col px-6 py-8 lg:px-12">
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
          onClick={() => fetchPortfolio()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
        >
          <span className={isFetching ? "animate-spin" : ""}>↻</span> Refresh
        </button>
      </div>

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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status="won" />
        <StatusBadge status="lost" />
        <StatusBadge status="refunded" />
        <StatusBadge status="pending" />
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-neon" />
        </div>
      )}

      {!loading && data && (
        <div
          className={`overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent transition-opacity duration-300 ${
            isFetching ? "opacity-60" : "opacity-100"
          }`}
        >
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
                  <th className="px-6 py-4">Market</th>
                  <th className="px-6 py-4">Round</th>
                  <th className="px-6 py-4">Choice</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Vault</th>
                  <th className="px-6 py-4">Outcome</th>
                  <th className="px-6 py-4">Payout</th>
                  <th className="px-6 py-4">Tx</th>
                </tr>
              </thead>
              <tbody>
                {allBets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-zinc-500">
                      <div className="mb-2 text-3xl">🎯</div>
                      No bets yet.{" "}
                      <Link href="/" className="text-neon hover:underline">
                        Place your first bet!
                      </Link>
                    </td>
                  </tr>
                ) : (
                  allBets.map((bet, i) => (
                    <tr
                      key={`${bet.txHash}-${i}`}
                      className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <AssetIcon symbol={ASSET_SYMBOL[bet.assetIndex] ?? "?"} size={24} />
                          <span className="font-semibold text-zinc-200">{bet.assetName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-400">#{bet.roundId}</td>
                      <td className="px-6 py-4 font-semibold text-zinc-300">{bet.choice}</td>
                      <td className="px-6 py-4 font-mono font-semibold text-zinc-200">
                        {formatIP(bet.amount)} IP
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-zinc-500">
                        #{bet.vaultId.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={bet.status} />
                      </td>
                      <td
                        className={`px-6 py-4 font-mono font-semibold ${
                          bet.status === "won"
                            ? "text-emerald-400"
                            : bet.status === "refunded"
                            ? "text-amber-400"
                            : bet.status === "lost"
                            ? "text-red-400"
                            : "text-zinc-500"
                        }`}
                      >
                        {bet.payout === "—" ? "—" : `${formatIP(bet.payout)} IP`}
                      </td>
                      <td className="px-6 py-4">
                        {bet.txHash && (
                          <a
                            href={`https://aeneid.storyscan.xyz/tx/${bet.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-electric transition hover:text-electric/80"
                          >
                            {shortenHash(bet.txHash)}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 p-4 lg:hidden">
            {allBets.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <div className="mb-2 text-3xl">🎯</div>
                No bets yet.{" "}
                <Link href="/" className="text-neon hover:underline">
                  Place your first bet!
                </Link>
              </div>
            ) : (
              allBets.map((bet, i) => (
                <div
                  key={`${bet.txHash}-${i}`}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AssetIcon symbol={ASSET_SYMBOL[bet.assetIndex] ?? "?"} size={24} />
                      <span className="font-semibold text-zinc-200">{bet.assetName}</span>
                    </div>
                    <StatusBadge status={bet.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-500">Round</span>
                      <p className="font-mono text-zinc-300">#{bet.roundId}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Choice</span>
                      <p className="font-semibold text-zinc-200">{bet.choice}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Amount</span>
                      <p className="font-mono font-semibold text-zinc-200">
                        {formatIP(bet.amount)} IP
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Payout</span>
                      <p
                        className={`font-mono font-semibold ${
                          bet.status === "won"
                            ? "text-emerald-400"
                            : bet.status === "refunded"
                            ? "text-amber-400"
                            : bet.status === "lost"
                            ? "text-red-400"
                            : "text-zinc-500"
                        }`}
                      >
                        {bet.payout === "—" ? "—" : `${formatIP(bet.payout)} IP`}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
