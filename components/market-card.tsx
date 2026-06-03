"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";

import {
  type MarketKey,
  MARKET_METADATA,
  getTargetPrice,
  formatTargetPrice
} from "@/lib/markets";
import { getMarketState } from "@/lib/market-contract";
import { createPublicClient, http } from "viem";
import { MARKET_ABI } from "@/lib/abi";
import { STORY_RPC_URL, STORY_TESTNET_CHAIN, ZERO_SIGHT_MARKET_ADDRESS } from "@/lib/story";
import { AssetIcon } from "@/components/asset-icon";

const publicClient = createPublicClient({
  chain: STORY_TESTNET_CHAIN,
  transport: http(STORY_RPC_URL)
});

interface MarketCardProps {
  marketId: MarketKey;
}

export function MarketCard({ marketId }: MarketCardProps) {
  const meta = MARKET_METADATA[marketId];

  const [status, setStatus] = useState(0);
  const [openingPrice, setOpeningPrice] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [pool, setPool] = useState<bigint>(BigInt(0));
  const [bettorCount, setBettorCount] = useState(0);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Poll on-chain state every 8s, tick every 1s for the countdown.
  useEffect(() => {
    let cancelled = false;
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);

    async function refresh() {
      try {
        const state = await getMarketState(meta.assetIndex);
        if (cancelled) return;
        setStatus(state.status);
        setOpeningPrice(state.openingPrice);
        setDeadline(state.deadline);
        setPool(state.totalPool);

        if (
          ZERO_SIGHT_MARKET_ADDRESS &&
          ZERO_SIGHT_MARKET_ADDRESS !== "0x0000000000000000000000000000000000000000"
        ) {
          const count = (await publicClient.readContract({
            address: ZERO_SIGHT_MARKET_ADDRESS,
            abi: MARKET_ABI,
            functionName: "getBettorCount",
            args: [meta.assetIndex]
          })) as bigint;
          if (!cancelled) setBettorCount(Number(count));
        }
      } catch {
        // swallow — card will simply show stale data, never crash the page.
      }
    }

    refresh();
    const poll = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [meta.assetIndex]);

  const timeLeft = deadline > now ? deadline - now : 0;

  const timeRemainingText = (() => {
    if (status === 1) return "Locked";
    if (status === 2) return "Resolved";
    if (timeLeft <= 0) return "Closed";
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    return m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s}s`;
  })();

  const cleanLabel = meta.label.replace(" (Daily)", "");
  const targetPrice = openingPrice ? getTargetPrice(meta.assetIndex, openingPrice) : 0;
  const targetPriceFormatted =
    targetPrice > 0 ? formatTargetPrice(meta.assetIndex, targetPrice) : "";

  const title = targetPriceFormatted
    ? `Will ${cleanLabel} close above ${targetPriceFormatted}?`
    : `${cleanLabel} direction ${meta.durationLabel === "Hourly" ? "for this hour?" : "for today?"}`;

  const poolFormatted = (() => {
    try {
      const num = Number(formatEther(pool));
      if (num === 0) return "0";
      return num < 0.01 ? num.toFixed(4) : num.toFixed(2);
    } catch {
      return "0";
    }
  })();

  return (
    <div className="group flex flex-col rounded-2xl border border-white/5 bg-[#141414] p-5 shadow-sm shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:border-neon/30 hover:shadow-lg hover:shadow-black/30">
      {/* Header — entire card is one Link to detail page */}
      <Link href={`/market/${marketId}`} className="block">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              CRYPTO
            </span>
            <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {cleanLabel}
            </span>
            <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {meta.durationLabel.toUpperCase()}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              status === 0 && timeLeft > 0
                ? timeLeft < 300
                  ? "text-rose-400"
                  : "text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            {timeRemainingText}
          </span>
        </div>

        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/[0.02] shadow-inner">
            <AssetIcon symbol={cleanLabel} size={34} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 sm:text-base">{title}</h3>
        </div>
      </Link>

      {/* Direction shortcuts — clickable Link with query param, no modal */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/market/${marketId}?direction=up`}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/5 bg-[#0F0F0F] py-3 transition hover:border-emerald-500/40 hover:bg-emerald-500/5"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Bet
          </span>
          <span className="text-sm font-bold text-emerald-400">↑ UP</span>
        </Link>
        <Link
          href={`/market/${marketId}?direction=down`}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/5 bg-[#0F0F0F] py-3 transition hover:border-rose-500/40 hover:bg-rose-500/5"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Bet
          </span>
          <span className="text-sm font-bold text-rose-400">↓ DOWN</span>
        </Link>
      </div>

      {/* Footer stats */}
      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4 text-xs font-semibold text-zinc-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-neon">●</span>
            <span className="font-mono">{poolFormatted} IP</span>
          </span>
          <span className="flex items-center gap-1">
            <span>👥</span>
            {bettorCount}
          </span>
        </div>
        <span className="text-zinc-600">{meta.durationLabel}</span>
      </div>
    </div>
  );
}
