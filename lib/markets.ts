export type MarketKey = "ip" | "btc" | "eth";

/** Asset index matching the contract's feed config mapping (0 = IP, 1 = BTC, 2 = ETH). */
export type AssetIndex = 0 | 1 | 2;

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
}

export const MARKET_METADATA: Record<MarketKey, MarketMeta> = {
  ip: {
    label: "IP",
    coingeckoId: "story-protocol",
    assetIndex: 0,
    feedAddress: "0xE23eCA12D7D2ED3829499556F6dCE06642AFd990",
    category: 0
  },
  btc: {
    label: "BTC",
    coingeckoId: "bitcoin",
    assetIndex: 1,
    feedAddress: "0xE94c9f9A1893f23be38A5C0394E46Ac05e8a5f8C",
    category: 0
  },
  eth: {
    label: "ETH",
    coingeckoId: "ethereum",
    assetIndex: 2,
    feedAddress: "0xf1454949C6dEdfb500ae63Aa6c784Aa1Dde08A6c",
    category: 0
  }
};

export const MARKET_LIST: MarketKey[] = ["ip", "btc", "eth"];
