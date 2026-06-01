export const MARKET_ABI = [
  "function startNextMarket(uint8 category, uint8 assetIndex, uint256 newDeadline) external",
  "function revealChoices(uint8 assetIndex, address[] calldata bettorAddresses, string[] calldata vaultIds, uint8[] calldata choices) external",
  "function resolveMarket(uint8 assetIndex) external",
  "function distributeWinnings(uint8 assetIndex, uint256 batchSize) external",
  "function sweepUnclaimed(uint8 assetIndex) external",
  "function lockMarket(uint8 assetIndex) external",
  "function isFullyDistributed(uint8 assetIndex) view returns (bool)",
  "function getBettorCount(uint8 assetIndex) view returns (uint256)",
  "function getBettors(uint8 assetIndex) view returns (address[])",
  "function markets(uint8 assetIndex) view returns (uint8 status, uint8 category, uint256 totalPool, uint256 openedAt, uint256 deadline, uint256 openingPrice, uint256 resolvedPrice, uint256 winningChoice, uint256 payoutPool, uint256 winningSharesTotal, uint256 distributionIndex)",
  "function getOracleSigners() view returns (address[])",
  // ── V2 additions ──
  "function currentRoundId(uint8 assetIndex) view returns (uint256)",
  "function targetBps(uint8 assetIndex) view returns (uint16)",
  "function keeper() view returns (address)",
  "function treasury() view returns (address)",
  "function owner() view returns (address)"
];

export type MarketCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AssetIndex = 0 | 1 | 2 | 3 | 4 | 5;

export const CATEGORY_LABELS: Record<string, MarketCategory> = {
  crypto: 0,
  sports: 1,
  politics: 2,
  esports: 3,
  economics: 4,
  entertainment: 5,
  other: 6
};

export const ASSET_LABELS: Record<string, AssetIndex> = {
  ip: 0,
  btc: 1,
  eth: 2,
  ip_daily: 3,
  btc_daily: 4,
  eth_daily: 5
};

export const FEED_IDS: Record<AssetIndex, string> = {
  0: "IP",
  1: "BTC",
  2: "ETH",
  3: "IP",
  4: "BTC",
  5: "ETH"
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
