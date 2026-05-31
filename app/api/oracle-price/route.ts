import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "IP").toUpperCase();

  try {
    const res = await fetch("https://oracle-gateway-1.a.redstone.vip/v2/data-packages/latest/redstone-primary-prod", {
      next: { revalidate: 5 } // Cache for 5 seconds to reduce rate limits
    });

    if (!res.ok) {
      throw new Error(`Redstone Gateway error: ${res.status}`);
    }

    const data = await res.json();
    const packages = data[symbol];

    if (!packages || packages.length === 0) {
      return NextResponse.json({ error: `Symbol ${symbol} not found` }, { status: 404 });
    }

    // Extract value and timestamp from the first package's first dataPoint
    const latestValue = packages[0].dataPoints[0].value;
    const timestamp = packages[0].timestampMilliseconds;

    return NextResponse.json({ price: latestValue, timestamp });
  } catch (error: any) {
    console.error("Failed to fetch Redstone oracle price:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
