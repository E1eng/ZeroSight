"use client";

import { MARKET_LIST } from "@/lib/markets";
import { MarketCard } from "@/components/market-card";

const CATEGORIES = ["ALL", "CRYPTO", "SPORTS", "ESPORTS", "ECONOMICS", "POLITICS", "ENTERTAINMENT", "OTHER"];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col px-6 py-8 lg:px-12">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-widest text-zinc-100 sm:text-3xl">
          PREDICTION MARKETS — LIVE ODDS & EVENT CONTRACTS
        </h1>
      </div>

      {/* Filters Bar */}
      <div className="mb-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Search */}
          <div className="flex w-full items-center rounded-xl bg-[#1A1A1A] px-4 py-3 sm:max-w-md">
            <span className="mr-3 text-zinc-500">🔍</span>
            <input
              type="text"
              placeholder="Search markets..."
              className="w-full bg-transparent text-sm font-semibold text-zinc-200 outline-none placeholder:text-zinc-500"
            />
          </div>

          {/* Dropdowns */}
          <div className="flex items-center gap-3">
            <select className="rounded-lg bg-[#1A1A1A] px-4 py-3 text-sm font-semibold text-zinc-300 outline-none">
              <option>Active</option>
              <option>Resolved</option>
              <option>Closed</option>
            </select>
            <select className="rounded-lg bg-[#1A1A1A] px-4 py-3 text-sm font-semibold text-zinc-300 outline-none">
              <option>Ending Soonest</option>
              <option>Liquidity</option>
              <option>Newest</option>
            </select>
            <button className="rounded-lg bg-[#1A1A1A] p-3 text-zinc-400 hover:text-white">
              ↻
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`rounded-full px-4 py-1.5 text-xs font-bold tracking-wider transition ${
                cat === "ALL"
                  ? "bg-neon text-black"
                  : "bg-[#1A1A1A] text-zinc-400 hover:bg-[#2A2A2A] hover:text-zinc-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        
        {/* Tags */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-500">
          <span className="uppercase tracking-widest">Tags</span>
          <span className="cursor-pointer hover:text-white">⚽ Soccer 16</span>
          <span className="cursor-pointer hover:text-white">⚾ Baseball 113</span>
          <span className="cursor-pointer hover:text-white">🏦 FOMC 1</span>
          <span className="cursor-pointer hover:text-white">⚡ SOL 1</span>
          <span className="cursor-pointer hover:text-white">ETH</span>
          <span className="cursor-pointer hover:text-white">BTC</span>
        </div>
      </div>

      <div className="mb-4 text-sm font-semibold text-zinc-400">
        Showing {MARKET_LIST.length} of {MARKET_LIST.length} markets
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MARKET_LIST.map((id) => (
          <MarketCard key={id} marketId={id} />
        ))}
      </div>
    </div>
  );
}
