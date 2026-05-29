import { NextRequest, NextResponse } from "next/server";

import { getCached, setCached } from "@/lib/cache";
import { MARKET_METADATA, type MarketKey } from "@/lib/markets";

const BASE_URL = "https://api.coingecko.com/api/v3";

async function fetchPrices(id: string) {
  const params = new URLSearchParams({ vs_currency: "usd", days: "1", interval: "hourly" });
  const res = await fetch(`${BASE_URL}/coins/${id}/market_chart?${params.toString()}`, {
    headers: { "User-Agent": "ZeroSightProtocol/0.1" }
  });

  if (!res.ok) {
    throw new Error(`CoinGecko error: ${res.status}`);
  }

  return res.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get("market") ?? "ip") as MarketKey;

  if (!MARKET_METADATA[market]) {
    return NextResponse.json({ error: "Unknown market" }, { status: 400 });
  }

  const cacheKey = `prices:${market}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json({ cached: true, data: cached });
  }

  try {
    const fresh = await fetchPrices(MARKET_METADATA[market].coingeckoId);
    setCached(cacheKey, fresh);
    return NextResponse.json({ cached: false, data: fresh });
  } catch (error) {
    console.error("CoinGecko fetch failed", error);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 502 });
  }
}
