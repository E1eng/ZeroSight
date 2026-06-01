# ZeroSight Protocol 🕶️

ZeroSight is a **Blind Parimutuel Prediction Market** built on the Story Protocol Aeneid Testnet. Using the **Story CDR (Confidential Data Rails) SDK**, bettor choices (Up/Down) are encrypted client-side and stored in threshold-encrypted vaults. No one — not even the smart contract — can see a bettor's pick until the market resolves, which prevents copy-trading and front-running.

The on-chain contract only ever sees the **bet amount** and a **CDR vault UUID**. The actual choice is revealed (and verified) only after the betting deadline by an automated keeper that decrypts the vault through the CDR validator network.

---

## Architecture Overview

```
┌──────────────┐     encrypt + allocate/write vault      ┌─────────────┐
│   Browser    │ ──────────────────────────────────────► │  Story CDR  │
│ (Privy wallet)│                                          │   Vaults    │
└──────┬───────┘                                          └─────┬───────┘
       │ placeBet(vaultId, assetIndex)  (amount only)            │ decrypt (keeper)
       ▼                                                         ▼
┌──────────────────────────────┐   reveal/resolve/distribute   ┌──────────────┐
│  ZeroSightMarket (UUPS proxy) │ ◄──────────────────────────── │  Keeper Bot  │
│  Solidity / Foundry           │                               │  (Node FSM)  │
└──────────────┬───────────────┘                               └──────┬───────┘
               │ events (BetPlaced, MarketResolved, …)                 │ Redstone price
               ▼                                                       ▼
        ┌──────────────┐                                        ┌─────────────┐
        │  Next.js UI  │                                        │   Redstone  │
        │  /portfolio  │                                        │   Oracles   │
        └──────────────┘                                        └─────────────┘
```

### Market lifecycle (per asset, per round)

1. **Open** — `startNextMarket` snapshots the Redstone opening price, sets a deadline, and bumps `currentRoundId`. Users place encrypted bets.
2. **Locked** — after the deadline the keeper decrypts each vault and submits `revealChoices`. Time-weighted shares (1x→2x linear decay toward the deadline) are computed on reveal.
3. **Resolved** — 10 minutes after the deadline the keeper calls `resolveMarket`, which pulls the signed Redstone price, compares against the per-asset target threshold, sets the winning direction, and deducts the 2% protocol fee to the treasury.
4. **Distributed** — `distributeWinnings` pays out winners in gas-bounded batches via push-safe low-level calls. Bets that failed to decrypt are automatically refunded in full.
5. **Auto-restart** — once distribution completes, the keeper opens the next round.

---

## Smart Contract — `ZeroSightMarket` (V2, UUPS upgradeable)

- **Upgradeable** via OpenZeppelin UUPS (`Initializable` + `OwnableUpgradeable` + `ReentrancyGuardUpgradeable` + `UUPSUpgradeable`). No constructor; initialized behind an `ERC1967Proxy`. A reserved `__gap` keeps storage append-safe for future upgrades.
- **Separated roles** (so a compromised keeper key cannot drain or upgrade the protocol):
  - **owner** — upgrades the contract, rotates keeper/treasury, configures feeds and target thresholds. Cold key.
  - **keeper** — drives the market lifecycle (`startNextMarket` / `lockMarket` / `revealChoices` / `resolveMarket` / `distributeWinnings` / `sweepUnclaimed`). Hot key, rotatable via `setKeeper` without an upgrade.
  - **treasury** — receives the 2% protocol fee. Defaults to owner, settable via `setTreasury`.
- **Round-aware indexing** — every round bumps `currentRoundId[assetIndex]`. All events carry `roundId`; `WinningsDistributed` / `BetRefunded` also carry the `vaultId`, so the frontend can correlate each bet to its exact outcome with zero ambiguity.
- **6 market slots** — assets `0–2` are Hourly (IP / BTC / ETH), assets `3–5` are Daily (IP / BTC / ETH). Hourly markets close at minute 50 (UTC); Daily markets close at 23:50 UTC.
- **Configurable target thresholds** — per-asset `targetBps` (basis points). A market resolves **Up** only if the price rises by at least the target relative to the opening price:
  | Asset | Hourly | Daily |
  |-------|--------|-------|
  | IP    | +0.75% | +4.00% |
  | BTC   | +0.25% | +1.50% |
  | ETH   | +0.40% | +2.50% |
- **Future-proof category enum** — `MarketCategory { Crypto, Sports, Politics, Esports, Economics, Entertainment, Other }`.
- **Redstone oracle integration** via `@redstone-finance/evm-connector` with an authorised signer set and a configurable signer threshold.
- **Time-weighted shares** — earlier bets earn up to a 2x multiplier, decaying linearly toward the deadline.
- **Anti-griefing distribution** — batched payouts with push-safe `call{value: …}("")`; a reverting recipient cannot halt the cycle. Unrevealed (CDR decrypt failure) bets are refunded.

### Deployed (Aeneid testnet)

| Item | Address |
|------|---------|
| Proxy (use this) | `0x570288C778b6A3ecD22c517f327c7635d817dC2e` |
| Redstone feed IDs | `IP` / `BTC` / `ETH` (bytes32 ASCII) |

> The proxy was upgraded to V2 via `script/UpgradeToV2.s.sol` (atomic `upgradeToAndCall` → `migrateV2`, then ownership transferred to a separate cold owner).

---

## Keeper Bot — single-process state machine

The keeper (`script/markets/keeper-bot.ts`) was rebuilt from a fragile subprocess-spawning loop into a single Node process with an explicit per-asset state machine:

```
script/markets/keeper/
├── types.ts          # asset registry + phase types
├── logger.ts         # structured logs (JSON lines in prod, pretty in TTY)
├── clients.ts        # one ethers + viem + CDR client, shared
├── nonce.ts          # centralised nonce manager (serialised txs, no collisions)
├── onchain-read.ts   # snapshot reads (status, bettors, signers) — block-timestamp based
├── onchain-write.ts  # gas-aware txs, Redstone-wrapped where needed
├── schedule.ts       # UTC-safe deadline math (minute-50 hourly, 23:50 daily)
├── decrypt.ts        # CDR decrypt with retry/backoff + on-chain bettor validation
└── state-machine.ts  # per-asset FSM: at most ONE privileged tx per tick
```

Key properties:

- **No nonce collisions** — all transactions go through one nonce manager; on error the chain nonce is re-synced.
- **UTC scheduling** — deadlines are computed from `block.timestamp` in UTC, immune to local clock drift.
- **One tx per tick** — bounded concurrency; an in-flight loop is skipped (`loop.skipOverlapping`) rather than stacked.
- **Resilient** — CDR decrypt retries with exponential backoff; a vault that can't be decrypted leaves the bet unrevealed so the contract refunds it.
- **Structured logging** — every action emits a parseable log line with tx hash, block, and gas.

---

## Frontend — Next.js 14 + Tailwind + Privy

- **Markets page** — live search, working category filter (Crypto active; Sports/Politics/etc. flagged "soon"), and sort. Market cards show live total pool and bettor count, polling on-chain state.
- **Market detail** — Redstone live price, opening/target price, a glowing Recharts area chart, and the encrypted order ticket (`Encrypt & Place Bet 🔒`). Status badge reflects real on-chain state (Active / Locked / Resolved).
- **Portfolio** — precise per-bet history correlated by `(roundId, vaultId)`:
  - Outcome (Won / Lost / Refunded / Pending) derived deterministically from on-chain events.
  - Amounts parsed with `parseEther` (no float drift).
  - The owner always sees their **own** choice (kept in `localStorage`), while the market stays blind to everyone else until reveal.
  - Optimistic "Pending" rows from `localStorage` dedup against on-chain logs and expire after 30 minutes.

### CDR integration notes

- `uuidToLabel` / `uploader.write` / `consumer.accessCDR` expect a **JS `number`** UUID (4-byte big-endian label), not a `BigInt`. All call sites convert with range-checked `Number(uuid)`.
- Gasless UX: the browser encrypts locally; a backend route (`/api/cdr/allocate` + `/api/cdr/write`) pays allocation/write fees so users only sign the `placeBet` transaction.
- `initWasm()` is initialised once and cached.

---

## Getting Started

### Prerequisites

- Node.js **22+** (CDR file storage needs it; the SDK core works on 18+)
- Foundry (`forge`, `cast`)

### Environment

Copy `.env.example` to `.env` and fill in:

```env
# Wallet roles
DEPLOYER_PRIVATE_KEY=0x...          # owner + treasury (cold)
MARKET_OPERATOR_PRIVATE_KEY=0x...   # keeper (hot)
KEEPER_ADDRESS=0x...                # public address of the keeper key
TREASURY_ADDRESS=0x...              # optional; defaults to owner

# Contract / network
NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS=0x570288C778b6A3ecD22c517f327c7635d817dC2e
NEXT_PUBLIC_OWNER_ADDRESS=0x...
NEXT_PUBLIC_STORY_RPC=https://aeneid.storyrpc.io
NEXT_PUBLIC_STORY_API=http://172.192.41.96:1317
NEXT_PUBLIC_STORY_CHAIN_ID=1315
NEXT_PUBLIC_PRIVY_APP_ID=...
STORY_RPC_URL=https://aeneid.storyrpc.io

# Redstone feed IDs (bytes32 ASCII)
STORY_FEED_ID=0x4950000000000000000000000000000000000000000000000000000000000000
BTC_FEED_ID=0x4254430000000000000000000000000000000000000000000000000000000000
ETH_FEED_ID=0x4554480000000000000000000000000000000000000000000000000000000000
```

> Private keys must include the `0x` prefix (Foundry's `vm.envUint` requires it).

### Install

```bash
forge install      # contract deps
npm install        # frontend + keeper deps
```

### Build & test contracts

```bash
forge build
forge test         # full suite (28 tests)
```

### Run the frontend

```bash
npm run dev
```

### Run the keeper

```bash
npm run keeper
```

---

## Deploying / Upgrading

**Fresh deploy** (new proxy):

```bash
KEEPER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
forge script script/DeployZeroSightMarket.s.sol --rpc-url "$STORY_RPC_URL" --broadcast --legacy --with-gas-price 2000000000
```

**Upgrade an existing V1 proxy to V2** (atomic upgrade + migrate + optional ownership transfer):

```bash
UPGRADER_PRIVATE_KEY=0x...            \
PROXY_ADDRESS=0x570288C778b6A3ecD22c517f327c7635d817dC2e \
KEEPER_ADDRESS=0x...                  \
TREASURY_ADDRESS=0x...                \
NEW_OWNER_ADDRESS=0x...               \
forge script script/UpgradeToV2.s.sol --rpc-url "$STORY_RPC_URL" --broadcast --legacy --with-gas-price 2000000000 --slow
```

> Aeneid's auto gas estimate can be too low; `--legacy --with-gas-price` avoids stuck pending txs.

---

## Security Model

- **Blind to others, not to yourself** — choices are hidden from other users (anti copy-trading), not from the bettor. The contract never sees a choice until reveal.
- **Keeper trust** — today the keeper decrypts and submits the revealed choices. A compromised keeper key cannot upgrade the contract or steal fees (role split), but it is currently trusted to report choices honestly. A future V3 (signed-choice / self-reveal) can make reveal trustless by having users sign their choice (verified on-chain with `ecrecover`); see the design discussion in the project notes.
- **Testnet only** — Aeneid is not production-grade confidentiality. Do not store real secrets.

---

## Built With

- **Contracts:** Solidity 0.8.25, Foundry, OpenZeppelin UUPS
- **Frontend:** Next.js 14, Tailwind CSS, Privy, viem, Recharts, TanStack Query
- **Confidentiality:** Story Protocol CDR SDK (`@piplabs/cdr-sdk`)
- **Oracles:** Redstone Finance (`@redstone-finance/evm-connector`)
- **Keeper:** Node + ethers v5 + tsx
