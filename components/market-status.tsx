import { formatEther } from "viem";
import { useEffect, useState } from "react";
import { getMarketState } from "@/lib/market-contract";

export function MarketStatusDisplay() {
  const [status, setStatus] = useState<number>(0);
  const [totalPool, setTotalPool] = useState<bigint>(BigInt(0));

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchState() {
      try {
        const state = await getMarketState();
        setStatus(state.status as number);
        setTotalPool(state.totalPool as bigint);
      } catch (err) {
        console.error("Failed to fetch market state:", err);
      }
    }

    fetchState();
    interval = setInterval(fetchState, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case 0: // Open
        return { label: "Betting Open", color: "bg-emerald-500", text: "text-emerald-400" };
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
          STORY
        </span>
      </div>
    </div>
  );
}
