# ZeroSight Protocol 🕶️

ZeroSight is a **Blind Parimutuel Prediction Market** built for the Story Protocol Aeneid Testnet. By leveraging the **Story CDR (Confidential Data Rails) SDK**, ZeroSight allows users to encrypt their predictions client-side. This ensures that no one (not even the smart contract) can see what a user has bet on until the market is resolved, preventing copy-trading and front-running.

## Enterprise Features (Hackathon Upgrades)

- **Shielded Bets (Story CDR):** Bettor choices (Up/Down) are encrypted directly in the browser and stored off-chain using the CDR network. Only the designated Keeper Bot can decrypt them at resolution time using the `SignerCondition` contract.
- **Time-Weighted Rewards:** Bettors who place their predictions early (closer to `openedAt`) receive up to a 2x shares multiplier. The multiplier linearly decays as the market approaches its deadline.
- **Protocol Revenue Fee:** A 2% protocol fee is deducted from the total pool during resolution and automatically transferred to the owner, proving a viable business model.
- **Anti-Griefing Batch Distribution:** Winnings are distributed in manageable batches (to avoid out-of-gas errors) using push-safe low-level calls `call{value: payout}("")`. This prevents malicious smart contracts from reverting and halting the distribution cycle.
- **Redstone Oracles:** Asset resolution utilizes Redstone Oracles to securely fetch real-time crypto prices on the Aeneid Testnet.
- **Autonomous Keeper Bot:** An intelligent NodeJS keeper monitors 3 concurrent markets (IP, BTC, ETH) via `Promise.all`. It seamlessly handles the continuous hourly lifecycle: Open -> Lock & Decrypt -> Resolve -> Distribute -> Restart.
- **Smart Contract Security:** Deployed as a UUPS Upgradeable Proxy with strict validation (e.g., minimum 0.01 IP bet, bounds checking).

## Architecture

1. **Place Bet:** User selects a market (e.g. IP/USD) and direction (Up/Down). The UI verifies the minimum bet (0.01 IP). The `handleBet` function uses `@piplabs/cdr-sdk` to encrypt the payload. The smart contract `ZeroSightMarket` only receives the Bet Amount and the `vaultId` UUID.
2. **Keeper Loop:** The `keeper-bot.ts` runs continuously in the background, monitoring the `deadline` of IP, BTC, and ETH markets simultaneously.
3. **Lock & Reveal:** When the deadline passes (Minute 50 of the hour), the keeper triggers `revealChoices`. The bot authenticates with the CDR nodes using its private key, decrypts the vaults, calculates the time-weighted multipliers, and submits the revealed choices on-chain.
4. **Oracle Settlement:** 10 minutes after locking (Minute 60), the keeper triggers `resolveMarket`, wrapping the transaction using `@redstone-finance/evm-connector` to securely submit the final Redstone oracle price and extract the 2% protocol fee.
5. **Batch Distribution:** The keeper triggers `distributeWinnings` to automatically payout the winners based on their time-weighted shares using anti-griefing transfers.
6. **Auto-Restart:** Once distribution is complete, the keeper automatically starts the next hourly round for that asset.

## Getting Started

### Prerequisites

- Node.js >= 18
- Foundry (`forge`)

### Environment Setup

Create a `.env` file based on `.env.example`:

```env
NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS=your_deployed_contract
DEPLOYER_PRIVATE_KEY=your_private_key
STORY_RPC_URL=https://aeneid.storyrpc.io
STORY_API_URL=https://api.story.foundation
```

### Installation

```bash
# Install smart contract dependencies
forge install

# Install frontend dependencies
npm install
```

### Running Locally

**1. Run the Next.js Frontend:**

```bash
npm run dev
```

**2. Start the Continuous Lifecycle (Keeper Bot):**
The Keeper Bot is the heartbeat of ZeroSight. Simply running it will automatically initialize the markets, process deadlines, decrypt choices, distribute winnings, and repeat the cycle every hour for IP, BTC, and ETH.

```bash
npx ts-node script/markets/keeper-bot.ts
```

## Smart Contract Tests

We have a comprehensive Foundry test suite covering initialization, betting, and market resolution logic.

```bash
forge test
```

## Built With

- **Smart Contracts:** Solidity, Foundry, OpenZeppelin UUPS
- **Frontend:** Next.js 14, Tailwind CSS, Privy
- **Confidentiality:** Story Protocol CDR SDK
- **Oracles:** Redstone Finance
