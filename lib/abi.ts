/**
 * Single source of truth for ZeroSightMarket V2 ABI fragments used by the
 * frontend + keeper. Centralised so we never drift between API routes.
 */

export const MARKET_ABI = [
  // ─── Lifecycle ────────────────────────────────────────────────
  {
    type: "function",
    name: "placeBet",
    stateMutability: "payable",
    inputs: [
      { name: "vaultId", type: "string" },
      { name: "assetIndex", type: "uint8" }
    ],
    outputs: []
  },

  // ─── Reads ────────────────────────────────────────────────────
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "assetIndex", type: "uint8" }],
    outputs: [
      { name: "status", type: "uint8" },
      { name: "category", type: "uint8" },
      { name: "totalPool", type: "uint256" },
      { name: "openedAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "openingPrice", type: "uint256" },
      { name: "resolvedPrice", type: "uint256" },
      { name: "winningChoice", type: "uint256" },
      { name: "payoutPool", type: "uint256" },
      { name: "winningSharesTotal", type: "uint256" },
      { name: "distributionIndex", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "currentRoundId",
    stateMutability: "view",
    inputs: [{ name: "assetIndex", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "targetBps",
    stateMutability: "view",
    inputs: [{ name: "assetIndex", type: "uint8" }],
    outputs: [{ name: "", type: "uint16" }]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "keeper",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "getBettorCount",
    stateMutability: "view",
    inputs: [{ name: "assetIndex", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }]
  },

  // ─── Events V2 (all carry roundId; payout/refund carry vaultId) ─
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "bettor", type: "address", indexed: true },
      { name: "vaultId", type: "string", indexed: false },
      { name: "assetIndex", type: "uint8", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketOpened",
    inputs: [
      { name: "assetIndex", type: "uint8", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "category", type: "uint8", indexed: false },
      { name: "openedAt", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "openingPrice", type: "uint256", indexed: false },
      { name: "targetBps", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { name: "assetIndex", type: "uint8", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "resolvedPrice", type: "uint256", indexed: false },
      { name: "targetPrice", type: "uint256", indexed: false },
      { name: "winningChoice", type: "uint256", indexed: false },
      { name: "feeTaken", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "WinningsDistributed",
    inputs: [
      { name: "assetIndex", type: "uint8", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "bettor", type: "address", indexed: true },
      { name: "vaultId", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "BetRefunded",
    inputs: [
      { name: "assetIndex", type: "uint8", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "bettor", type: "address", indexed: true },
      { name: "vaultId", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false }
    ]
  }
] as const;
