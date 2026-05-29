"use client";

import { MARKET_LIST, MARKET_METADATA, type MarketKey } from "@/lib/markets";
import { clsx } from "clsx";

type MarketToggleProps = {
  active: MarketKey;
  onChange: (key: MarketKey) => void;
};

export function MarketToggle({ active, onChange }: MarketToggleProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
      {MARKET_LIST.map((key: MarketKey) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isActive
                ? "bg-electric text-night-900 shadow-glow"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
            )}
          >
            {MARKET_METADATA[key].label}
          </button>
        );
      })}
    </div>
  );
}
