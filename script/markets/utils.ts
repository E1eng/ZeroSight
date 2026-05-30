export const MARKET_ABI = [
  "function startNextMarket(uint8 category, uint8 assetIndex, uint256 newDeadline) external",
  "function revealChoices(uint8 assetIndex, address[] calldata bettorAddresses, string[] calldata vaultIds, uint8[] calldata choices) external",
  "function resolveMarket(uint8 assetIndex) external",
  "function distributeWinnings(uint8 assetIndex, uint256 batchSize) external",
  "function sweepUnclaimed(uint8 assetIndex) external",
  "function lockMarket(uint8 assetIndex) external",
  "function isFullyDistributed(uint8 assetIndex) view returns (bool)",
  "function getBettorCount(uint8 assetIndex) view returns (uint256)",
  "function markets(uint8 assetIndex) view returns (uint8 status, uint8 category, uint256 totalPool, uint256 openedAt, uint256 deadline, uint256 openingPrice, uint256 resolvedPrice, uint256 winningChoice, uint256 payoutPool, uint256 winningSharesTotal, uint256 distributionIndex)",
  "function getUserBets(uint8 assetIndex, address bettor) view returns (tuple(uint256 amount, uint256 shares, uint8 assetIndex, string vaultId, uint8 direction, bool choiceRevealed, bool distributed, uint256 placedAt)[])"
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
