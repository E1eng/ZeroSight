"use client";

import { formatEther } from "viem";
import { useEffect, useState } from "react";

import { getMarketState } from "@/lib/market-contract";
import type { AssetIndex } from "@/lib/markets";

/**
 * Live market status pill. Re-fetches on-chain state every 5s and ticks the
 * countdown every second. The whole component is keyed on assetIndex by the
 * parent; if you remount it (e.g. switching markets) the local state resets.
 */
export function MarketStatusDisplay({ assetIndex }: { assetIndex: AssetIndex }) {
  // -1 represents "loading", so we never accidentally render Resolved or
  // Betting Closed before the first fetch completes.
  const [status, setStatus] = useState<number>(-1);
  const [totalPool, setTotalPool] = useState<bigint>(BigInt(0));
  const [deadline, setDeadline] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchState() {
      try {
        const state = await getMarketState(assetIndex);
        if (cancelled) return;
        setStatus(state.status as number);
        setTotalPool(state.totalPool as bigint);
        setDeadline(state.deadline || 0);
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error("[MarketStatus] fetch failed", { assetIndex, err });
        }
      }
    }

    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [assetIndex]);

  useEffect(() => {
    if (deadline === 0) {
      setTimeLeft(0);
      return;
    }
    // For Open markets count down to the deadline; for Locked markets count
    // down to the resolve moment (deadline + lock window). Both cadences use a
    // 10-min lock window — mirrors the keeper's schedule.
    const lockWindow = 600;
    const target = status === 1 ? deadline + lockWindow : deadline;

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = target - now;
      setTimeLeft(diff > 0 ? diff : 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [status, deadline, assetIndex]);

  const config = (() => {
    if (status === -1) {
      return { label: "Loading…", color: "bg-zinc-600", text: "text-zinc-500" };
    }
    if (status === 0) {
      if (timeLeft > 0) {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        return {
          label: `Closes in ${m}m ${s}s`,
          color: "bg-emerald-500",
          text: "text-emerald-400 font-mono"
        };
      }
      return { label: "Betting closed", color: "bg-zinc-500", text: "text-zinc-400" };
    }
    if (status === 1) {
      if (timeLeft > 0) {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        return {
          label: `Resolves in ${m}m ${s}s`,
          color: "bg-amber-500",
          text: "text-amber-400 font-mono"
        };
      }
      return { label: "Resolving…", color: "bg-amber-500", text: "text-amber-400" };
    }
    if (status === 2) {
      return { label: "Resolved", color: "bg-zinc-500", text: "text-zinc-400" };
    }
    return { label: "Unknown", color: "bg-zinc-500", text: "text-zinc-400" };
  })();

  const poolFormatted = formatEther(totalPool);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/5 bg-black/40 px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Status</span>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 shrink-0 rounded-full ${config.color} shadow-[0_0_8px_currentColor]`} />
          <span className={`whitespace-nowrap text-sm font-semibold uppercase tracking-wider ${config.text}`}>
            {config.label}
          </span>
        </div>
      </div>

      <div className="hidden h-8 w-px bg-white/10 sm:block" />

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Total Pool</span>
        <span className="whitespace-nowrap text-sm font-mono font-semibold text-zinc-200">
          {Number(poolFormatted).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
          })}{" "}
          IP
        </span>
      </div>
    </div>
  );
}
