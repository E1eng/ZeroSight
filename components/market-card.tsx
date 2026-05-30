"use client";

import Link from "next/link";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { type MarketKey, MARKET_METADATA } from "@/lib/markets";

interface MarketCardProps {
  marketId: MarketKey;
  key?: string | number;
}

export function MarketCard({ marketId }: MarketCardProps) {
  const { authenticated, login } = usePrivy();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [betDirection, setBetDirection] = useState<'up' | 'down'>('up');
  const [betAmount, setBetAmount] = useState("10");

  const meta = MARKET_METADATA[marketId];
  
  // Hardcoded for demo to match image, but in reality we'd pull from contract/metadata
  const timeRemaining = "29m left";
  const tags = ["CRYPTO", meta.label];
  
  const title = `${meta.label} direction for the next 24h?`;

  const openQuickBet = (e: React.MouseEvent, direction: 'up' | 'down') => {
    e.preventDefault();
    if (!authenticated) {
      login();
      return;
    }
    setBetDirection(direction);
    setBetAmount("10");
    setIsModalOpen(true);
  };

  const confirmBet = () => {
    setIsModalOpen(false);
    // You could replace this with a beautiful toast later
    console.log(`Placed ${betAmount} IP bet on ${meta.label} ${betDirection.toUpperCase()}`);
  };

  return (
    <>
    <div className="flex flex-col rounded-2xl bg-[#141414] p-5 shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl relative z-10">
      {/* Clickable Area to Enter Market */}
      <Link href={`/market/${marketId}`} className="block group cursor-pointer">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="text-xs font-bold text-rose-500">{timeRemaining}</span>
        </div>

        {/* Asset / Title */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center transition group-hover:scale-105">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1A1A] text-xl font-bold text-white shadow-inner">
            {meta.label === "IP" ? "IP" : meta.label === "BTC" ? "₿" : "Ξ"}
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 sm:text-base">
            {title}
          </h3>
        </div>
      </Link>

      {/* Quick Bet Buttons */}
      <div className="grid grid-cols-2 gap-3 relative z-20">
        <button
          onClick={(e) => openQuickBet(e, 'up')}
          className="group flex flex-col items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] py-4 transition hover:bg-neon/10"
        >
          <span className="text-2xl transition group-hover:scale-110">👍</span>
          <span className="text-sm font-bold text-neon">Up</span>
        </button>
        
        <button
          onClick={(e) => openQuickBet(e, 'down')}
          className="group flex flex-col items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] py-4 transition hover:bg-rose-500/10"
        >
          <span className="text-2xl transition group-hover:scale-110">👎</span>
          <span className="text-sm font-bold text-rose-500">Down</span>
        </button>
      </div>

      {/* Footer / Stats */}
      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4 text-xs font-semibold text-zinc-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-neon">💰</span>
            0 IP
          </span>
          <span className="flex items-center gap-1">
            <span>👥</span>
            0
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>🕒</span>
          <span>📈</span>
        </div>
      </div>
    </div>

    {/* Custom Quick Bet Modal Overlay */}
    {isModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0B0B0B] p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Quick Bet <span className={betDirection === 'up' ? "text-neon" : "text-rose-500"}>{betDirection.toUpperCase()}</span>
            </h2>
            <button 
              onClick={() => setIsModalOpen(false)}
              className="rounded-lg bg-white/5 p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1A1A] text-xl font-bold text-white shadow-inner">
              {meta.label === "IP" ? "IP" : meta.label === "BTC" ? "₿" : "Ξ"}
            </div>
            <p className="text-sm font-semibold text-zinc-300">
              {meta.label} direction for the next 24h?
            </p>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Amount (IP)
            </label>
            <div className="flex items-center rounded-xl border border-white/10 bg-[#141414] px-4 py-3 focus-within:border-neon/50">
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-full bg-transparent text-lg font-bold text-white outline-none"
                autoFocus
              />
              <span className="font-bold text-zinc-500">IP</span>
            </div>
          </div>

          <button
            onClick={confirmBet}
            className={`w-full rounded-xl py-4 text-sm font-bold tracking-widest text-black transition hover:scale-[1.02] ${
              betDirection === 'up' ? 'bg-neon shadow-[0_0_15px_rgba(186,255,0,0.3)] hover:bg-neon/90' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:bg-rose-600'
            }`}
          >
            CONFIRM BET
          </button>
        </div>
      </div>
    )}
    </>
  );
}
