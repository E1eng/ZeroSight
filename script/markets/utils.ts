export const MARKET_ABI = [
  "function startNextMarket(uint8 category, uint8 assetIndex, uint256 newDeadline) external",
  "function resolveMarket() external",
  "function distributeWinnings(uint256 batchSize) external",
  "function sweepUnclaimed() external",
  "function activeCategory() view returns (uint8)",
  "function activeAsset() view returns (uint8)",
  "function deadline() view returns (uint256)",
  "function marketStatus() view returns (uint8)",
  "function isFullyDistributed() view returns (bool)",
  "function getBettorCount() view returns (uint256)",
  "function totalPool() view returns (uint256)",
  "function winningChoice() view returns (uint256)",
  "function distributionIndex() view returns (uint256)"
];

export type MarketCategory = 0 | 1 | 2; // Crypto | Sports | Politics
export type AssetIndex = 0 | 1 | 2; // IP | BTC | ETH

export const CATEGORY_LABELS: Record<string, MarketCategory> = {
  crypto: 0,
  sports: 1,
  politics: 2
};

export const ASSET_LABELS: Record<string, AssetIndex> = {
  ip: 0,
  btc: 1,
  eth: 2
};

export const FEED_IDS: Record<AssetIndex, string> = {
  0: "STORY_IP",
  1: "BTC",
  2: "ETH"
};

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Locked",
  2: "Resolved"
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}
