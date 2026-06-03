# Architecture

ZeroSight is a **blind parimutuel prediction market**. Bettor choices (Up/Down) are encrypted client-side with the Story CDR SDK and stored in threshold-encrypted vaults. The on-chain contract only ever sees the **bet amount** and a **CDR vault UUID** — never the choice — until the market resolves.

```
┌───────────────┐   encrypt + allocate/write vault       ┌─────────────┐
│    Browser    │ ─────────────────────────────────────► │  Story CDR  │
│ (Privy wallet)│                                         │   Vaults    │
└──────┬────────┘                                         └─────┬───────┘
       │ placeBet(vaultId, assetIndex)  (amount only)            │ decrypt (keeper / self)
       ▼                                                         ▼
┌──────────────────────────────┐  lock/reveal/resolve/distribute  ┌──────────────┐
│ ZeroSightMarket (UUPS proxy)  │ ◄─────────────────────────────── │  Keeper Bot  │
│ Solidity / Foundry            │                                  │  (Node FSM)  │
└──────────────┬────────────────┘                                 └──────┬───────┘
               │ events (BetPlaced, MarketResolved, …)                    │ Redstone price
               ▼                                                          ▼
        ┌──────────────┐                                          ┌─────────────┐
        │  Next.js UI  │                                          │   Redstone  │
        │  /portfolio  │                                          │   Oracles   │
        └──────────────┘                                          └─────────────┘
```

## Components

| Layer | Tech | Responsibility |
|-------|------|----------------|
| Contract | Solidity 0.8.25, Foundry, OZ UUPS | Custody, parimutuel accounting, oracle settlement, role-gated lifecycle |
| Confidentiality | Story CDR SDK (`@piplabs/cdr-sdk`) | Threshold-encrypted vaults for bettor choices |
| Oracle | Redstone (`@redstone-finance/evm-connector`) | Signed price for resolution |
| Keeper | Node + ethers v5 + tsx | Drives the per-asset lifecycle off-chain |
| Frontend | Next.js 14, Tailwind, Privy, viem, Recharts | Betting UX + portfolio |

## Market slots

Six independent market slots run in parallel:

| Index | Asset | Cadence |
|-------|-------|---------|
| 0 | IP  | Hourly |
| 1 | BTC | Hourly |
| 2 | ETH | Hourly |
| 3 | IP  | Daily |
| 4 | BTC | Daily |
| 5 | ETH | Daily |

## Market lifecycle (per asset, per round)

1. **Open** — `startNextMarket` snapshots the Redstone opening price, sets a deadline, and bumps `currentRoundId`. Users place encrypted bets.
2. **Locked** — at the deadline the keeper calls `lockMarket` (cheap, instant). Betting closes.
3. **Staggered reveal** — during the locked window the keeper decrypts vaults in **small parallel batches per tick** (bounded concurrency) and submits `revealChoices` incrementally. Time-weighted shares (1x→2x, decaying toward the deadline) are computed on reveal.
4. **Resolved** — after the lock window the keeper calls `resolveMarket`: pulls the signed Redstone price, compares against the per-asset target threshold, sets the winning direction, deducts the 2% protocol fee to the treasury.
5. **Distributed** — `distributeWinnings` pays winners in gas-bounded batches via push-safe `call`. Bets that never decrypted are refunded in full.
6. **Auto-restart** — once distribution completes, the keeper opens the next round.

> The deadline→resolve gap (betting closes before the resolution candle) is intentional: it prevents betting with near-certainty as the candle closes. The keeper uses that window for staggered decryption.

## Target thresholds

A market resolves **Up** only if price rises by at least the per-asset target vs the opening price. Configurable on-chain via `setTargetBps`.

| Asset | Hourly | Daily |
|-------|--------|-------|
| IP    | +0.75% | +4.00% |
| BTC   | +0.25% | +1.50% |
| ETH   | +0.40% | +2.50% |

## Round-aware indexing

Every round bumps `currentRoundId[assetIndex]`. All events carry `roundId`; `WinningsDistributed` / `BetRefunded` also carry `vaultId`. This lets the frontend correlate each bet to its exact outcome with zero ambiguity (no block-number heuristics).
