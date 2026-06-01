import type { AssetIndex } from "../utils";

export type AssetKey =
  | "ip"
  | "btc"
  | "eth"
  | "ip_daily"
  | "btc_daily"
  | "eth_daily";

export const ASSETS: { key: AssetKey; index: AssetIndex; cadence: "hourly" | "daily" }[] = [
  { key: "ip", index: 0, cadence: "hourly" },
  { key: "btc", index: 1, cadence: "hourly" },
  { key: "eth", index: 2, cadence: "hourly" },
  { key: "ip_daily", index: 3, cadence: "daily" },
  { key: "btc_daily", index: 4, cadence: "daily" },
  { key: "eth_daily", index: 5, cadence: "daily" }
];

/** Logical phase for a market round. Mirrors but is not 1:1 with on-chain MarketStatus. */
export type Phase =
  | "idle"            // settled & distributed; waiting to start the next round
  | "starting"        // tx in flight: startNextMarket
  | "open"            // open for bets, deadline not yet reached
  | "locking"         // deadline passed; revealing/locking in progress
  | "revealed"        // choices revealed, waiting for resolve window
  | "resolving"       // tx in flight: resolveMarket
  | "distributing"    // distribution batches in progress
  | "error";          // last action failed; cooling off before retry

export interface MarketSnapshot {
  status: 0 | 1 | 2;        // Open | Locked | Resolved
  totalPool: bigint;
  openedAt: number;
  deadline: number;
  openingPrice: bigint;
  resolvedPrice: bigint;
  winningChoice: number;
  payoutPool: bigint;
  winningSharesTotal: bigint;
  distributionIndex: bigint;
  bettorCount: number;
  isFullyDistributed: boolean;
  currentRoundId: bigint;
}

export interface AssetState {
  key: AssetKey;
  index: AssetIndex;
  cadence: "hourly" | "daily";
  phase: Phase;
  lastError: string | null;
  cooldownUntil: number; // unix seconds; if > now, skip this asset
  snapshot: MarketSnapshot | null;
}
