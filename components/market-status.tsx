import { formatEther } from "viem";
import { useEffect, useState } from "react";
import { getMarketState } from "@/lib/market-contract";
import type { AssetIndex } from "@/lib/markets";

export function MarketStatusDisplay({ assetIndex }: { assetIndex: AssetIndex }) {
  const [status, setStatus] = useState<number>(0);
  const [totalPool, setTotalPool] = useState<bigint>(BigInt(0));
  const [deadline, setDeadline] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchState() {
      try {
        const state = await getMarketState(assetIndex);
        setStatus(state.status as number);
        setTotalPool(state.totalPool as bigint);
        setDeadline(state.deadline || 0);
      } catch (err) {
        console.error("Failed to fetch market state:", err);
      }
    }

    fetchState();
    interval = setInterval(fetchState, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [assetIndex]);

  // Tick the countdown every second
  useEffect(() => {
    if (status !== 0 || deadline === 0) {
      setTimeLeft(0);
      return;
    }

    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const diff = deadline - now;
      setTimeLeft(diff > 0 ? diff : 0);
    }

    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [status, deadline]);

  const getStatusConfig = () => {
    switch (status) {
      case 0: // Open
        if (timeLeft > 0) {
          const minutes = Math.floor(timeLeft / 60);
          const seconds = timeLeft % 60;
          return {
            label: `Closes in ${minutes}m ${seconds}s`,
            color: "bg-emerald-500",
            text: "text-emerald-400 font-mono"
          };
        } else {
          return { label: "Betting Closed", color: "bg-zinc-500", text: "text-zinc-400" };
        }
      case 1: // Locked
        return { label: "Market Locked", color: "bg-amber-500", text: "text-amber-400" };
      case 2: // Resolved
        return { label: "Resolved", color: "bg-zinc-500", text: "text-zinc-400" };
      default:
        return { label: "Unknown", color: "bg-zinc-500", text: "text-zinc-400" };
    }
  };

  const config = getStatusConfig();
  const poolFormatted = formatEther(totalPool);

  return (
    <div className="flex items-center gap-6 rounded-2xl border border-white/5 bg-black/40 px-6 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Status</span>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${config.color} shadow-[0_0_8px_currentColor]`} />
          <span className={`text-sm font-semibold uppercase tracking-wider ${config.text}`}>
            {config.label}
          </span>
        </div>
      </div>

      <div className="h-8 w-px bg-white/10" />

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Total Pool</span>
        <span className="text-sm font-mono font-semibold text-zinc-200">
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
