"use client";

import { useMemo, useState } from "react";

import { MARKET_LIST, MARKET_METADATA, type MarketKey } from "@/lib/markets";
import { MarketCard } from "@/components/market-card";

type CategoryKey = "ALL" | "CRYPTO" | "SPORTS" | "POLITICS" | "ESPORTS" | "ECONOMICS" | "ENTERTAINMENT";
type StatusFilter = "ACTIVE" | "ALL";
type SortKey = "ENDING_SOON" | "DURATION" | "ASSET";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CRYPTO", label: "Crypto" },
  { key: "SPORTS", label: "Sports" },
  { key: "POLITICS", label: "Politics" },
  { key: "ESPORTS", label: "Esports" },
  { key: "ECONOMICS", label: "Economics" },
  { key: "ENTERTAINMENT", label: "Entertainment" }
];

/** Marker-only — Sports/Politics/etc. arrive in a future contract upgrade. */
const SUPPORTED_CATEGORIES: ReadonlySet<CategoryKey> = new Set(["ALL", "CRYPTO"]);

export default function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryKey>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [sort, setSort] = useState<SortKey>("ENDING_SOON");

  const visible: MarketKey[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = MARKET_LIST.filter((id) => {
      const meta = MARKET_METADATA[id];
      if (q) {
        const haystack = `${meta.label} ${meta.coingeckoId} ${meta.durationLabel}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (category !== "ALL") {
        // Only Crypto markets exist in V2 today; gracefully filter to none for upcoming categories.
        if (category !== "CRYPTO") return false;
      }
      // status filter is currently a no-op until we surface resolved-only history;
      // ACTIVE is the safe default and we keep ALL as a future hook.
      return true;
    });

    if (sort === "DURATION") {
      out = [...out].sort((a, b) =>
        MARKET_METADATA[a].durationLabel.localeCompare(MARKET_METADATA[b].durationLabel)
      );
    } else if (sort === "ASSET") {
      out = [...out].sort((a, b) => MARKET_METADATA[a].label.localeCompare(MARKET_METADATA[b].label));
    }
    return out;
  }, [search, category, sort, status]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col px-6 py-8 lg:px-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-widest text-zinc-100 sm:text-3xl">
          PREDICTION MARKETS — LIVE ODDS &amp; EVENT CONTRACTS
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Encrypted bets via Story CDR · Settled by Redstone oracles
        </p>
      </div>

      {/* Filters Bar */}
      <div className="mb-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex w-full items-center rounded-xl bg-[#1A1A1A] px-4 py-3 sm:max-w-md">
            <span className="mr-3 text-zinc-500">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets (IP, BTC, hourly…)"
              className="w-full bg-transparent text-sm font-semibold text-zinc-200 outline-none placeholder:text-zinc-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="ml-2 text-zinc-500 hover:text-zinc-200"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="rounded-lg bg-[#1A1A1A] px-4 py-3 text-sm font-semibold text-zinc-300 outline-none"
            >
              <option value="ACTIVE">Active</option>
              <option value="ALL">All Rounds</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg bg-[#1A1A1A] px-4 py-3 text-sm font-semibold text-zinc-300 outline-none"
            >
              <option value="ENDING_SOON">Ending Soonest</option>
              <option value="DURATION">By Duration</option>
              <option value="ASSET">By Asset</option>
            </select>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => {
            const isActive = category === c.key;
            const isSupported = SUPPORTED_CATEGORIES.has(c.key);
            return (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                disabled={!isSupported}
                title={isSupported ? undefined : "Coming soon"}
                className={`rounded-full px-4 py-1.5 text-xs font-bold tracking-wider transition ${
                  isActive
                    ? "bg-neon text-black"
                    : isSupported
                    ? "bg-[#1A1A1A] text-zinc-400 hover:bg-[#2A2A2A] hover:text-zinc-200"
                    : "bg-[#1A1A1A]/60 text-zinc-600 cursor-not-allowed"
                }`}
              >
                {c.label.toUpperCase()}
                {!isSupported && <span className="ml-1 opacity-60">·soon</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 text-sm font-semibold text-zinc-400">
        Showing {visible.length} of {MARKET_LIST.length} markets
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-zinc-500">
          No markets match your filters. Try clearing the search or switching category.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((id) => (
            <MarketCard key={id} marketId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
