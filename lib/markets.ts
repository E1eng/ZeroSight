export type MarketKey = "ip" | "btc" | "eth" | "ip_daily" | "btc_daily" | "eth_daily";

/** Asset index matching the contract's feed config mapping (0-2 = Hourly, 3-5 = Daily). */
export type AssetIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** Maps to the contract's MarketCategory enum (0 = Crypto, 1 = Sports, 2 = Politics). */
export type MarketCategory = 0 | 1 | 2;

export interface MarketMeta {
  label: string;
  coingeckoId: string;
  assetIndex: AssetIndex;
  /** On-chain Redstone feed address on Aeneid testnet. */
  feedAddress: `0x${string}`;
  /** Contract MarketCategory enum value. */
  category: MarketCategory;
  durationLabel: "Hourly" | "Daily";
}

export const MARKET_METADATA: Record<MarketKey, MarketMeta> = {
  ip: {
    label: "IP",
    coingeckoId: "story-2",
    assetIndex: 0,
    feedAddress: "0xE23eCA12D7D2ED3829499556F6dCE06642AFd990",
    category: 0,
    durationLabel: "Hourly"
  },
  btc: {
    label: "BTC",
    coingeckoId: "bitcoin",
    assetIndex: 1,
    feedAddress: "0xE94c9f9A1893f23be38A5C0394E46Ac05e8a5f8C",
    category: 0,
    durationLabel: "Hourly"
  },
  eth: {
    label: "ETH",
    coingeckoId: "ethereum",
    assetIndex: 2,
    feedAddress: "0xf1454949C6dEdfb500ae63Aa6c784Aa1Dde08A6c",
    category: 0,
    durationLabel: "Hourly"
  },
  ip_daily: {
    label: "IP (Daily)",
    coingeckoId: "story-2",
    assetIndex: 3,
    feedAddress: "0xE23eCA12D7D2ED3829499556F6dCE06642AFd990",
    category: 0,
    durationLabel: "Daily"
  },
  btc_daily: {
    label: "BTC (Daily)",
    coingeckoId: "bitcoin",
    assetIndex: 4,
    feedAddress: "0xE94c9f9A1893f23be38A5C0394E46Ac05e8a5f8C",
    category: 0,
    durationLabel: "Daily"
  },
  eth_daily: {
    label: "ETH (Daily)",
    coingeckoId: "ethereum",
    assetIndex: 5,
    feedAddress: "0xf1454949C6dEdfb500ae63Aa6c784Aa1Dde08A6c",
    category: 0,
    durationLabel: "Daily"
  }
};

export const MARKET_LIST: MarketKey[] = ["ip", "btc", "eth", "ip_daily", "btc_daily", "eth_daily"];

/**
 * Calculates the target resolution price based on opening price and asset rules.
 * Oracle prices from Redstone are in 8 decimals.
 */
export function getTargetPrice(assetIndex: AssetIndex, openingPrice: number): number {
  if (!openingPrice) return 0;
  const openingPriceFloat = openingPrice / 1e8;
  
  switch (assetIndex) {
    case 0: // IP hourly (+0.75%)
      return openingPriceFloat * 1.0075;
    case 1: // BTC hourly (+0.25%)
      return openingPriceFloat * 1.0025;
    case 2: // ETH hourly (+0.40%)
      return openingPriceFloat * 1.0040;
    case 3: // IP daily (+4.00%)
      return openingPriceFloat * 1.0400;
    case 4: // BTC daily (+1.50%)
      return openingPriceFloat * 1.0150;
    case 5: // ETH daily (+2.50%)
      return openingPriceFloat * 1.0250;
    default:
      return openingPriceFloat;
  }
}

/**
 * Formats the target price with appropriate decimals per asset.
 */
export function formatTargetPrice(assetIndex: AssetIndex, targetPrice: number): string {
  if (!targetPrice) return "";
  if (assetIndex === 0 || assetIndex === 3) {
    // IP is small, format with 4 decimal places
    return `$${targetPrice.toFixed(4)}`;
  }
  // BTC and ETH are large, format with thousands separator and 2 decimal places
  return `$${targetPrice.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

