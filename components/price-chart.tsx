"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

import type { MarketKey } from "@/lib/markets";

type PriceChartProps = {
  market: MarketKey;
  openedAt?: number;
};

type CoinGeckoResponse = {
  prices: [number, number][];
};

function formatTimestamp(ts: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "numeric"
  }).format(ts);
}

export function PriceChart({ market, openedAt }: PriceChartProps) {
  const { data, isLoading } = useQuery<{ cached: boolean; data: CoinGeckoResponse }>({
    queryKey: ["prices", market],
    queryFn: async () => {
      const res = await fetch(`/api/prices?market=${market}`);
      if (!res.ok) {
        throw new Error("Failed to load prices");
      }
      return res.json();
    },
    staleTime: 60_000
  });

  const points = (data?.data.prices ?? []).map(([time, price]: [number, number]) => ({
    time,
    price
  }));

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
      <div className="absolute -left-32 top-10 h-56 w-56 rounded-full bg-electric/20 blur-3xl" />
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
          Loading chart…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f6bff" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#4f6bff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip
              contentStyle={{
                background: "rgba(15,15,18,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12
              }}
              labelFormatter={(value) => formatTimestamp(value as number)}
              formatter={(value: number | string) => {
                const numeric = typeof value === "number" ? value : Number(value);
                return [`$${Number.isFinite(numeric) ? numeric.toFixed(4) : "0.0000"}`, "Price"];
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#4f6bff"
              strokeWidth={3}
              fill="url(#glow)"
              dot={false}
            />
            {openedAt && openedAt > 0 && (
              <ReferenceLine 
                x={openedAt * 1000} 
                stroke="#00ff9d" 
                strokeDasharray="3 3"
                label={{ position: "insideTopLeft", value: "Market Opened", fill: "#00ff9d", fontSize: 12 }} 
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
