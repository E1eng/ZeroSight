# ZeroSight Protocol 🕶️

ZeroSight is a **Blind Parimutuel Prediction Market** built for the Story Protocol Aeneid Testnet. By leveraging the **Story CDR (Confidential Data Rails) SDK**, ZeroSight allows users to encrypt their predictions client-side. This ensures that no one (not even the smart contract) can see what a user has bet on until the market is resolved, preventing copy-trading and front-running.

## Features

- **Shielded Bets:** Bettor choices (Up/Down) are encrypted directly in the browser and stored off-chain using the CDR network.
- **Redstone Oracles:** Asset resolution utilizes Redstone Oracles to securely fetch real-time crypto prices on the Aeneid Testnet.
- **Auto-Distribution:** Winnings are calculated and distributed automatically based on parimutuel shares.
- **Keeper Bot:** An autonomous NodeJS keeper monitors market deadlines and seamlessly handles off-chain decryption and on-chain resolution.
- **Smart Contract Security:** Fully tested and secured against choice overwrite logic vulnerabilities. Deployed as a UUPS Upgradeable Proxy to support future sports and politics markets.

## Architecture

1. **Place Bet:** User selects a market (e.g. IP/USD) and direction (Up/Down). The `handleBet` function uses `@piplabs/cdr-sdk` to encrypt the payload. The smart contract `ZeroSightMarket` only receives the Bet Amount and the `vaultId` UUID.
2. **Keeper Loop:** The `keeper-bot.ts` runs in the background. It monitors `deadline`.
3. **Resolution:** When the deadline passes, the keeper triggers `revealChoices`. The CDR nodes decrypt the payloads, and the keeper submits the revealed choices on-chain.
4. **Oracle Settlement:** The keeper triggers `resolveMarket`, which wraps the transaction using `@redstone-finance/evm-connector` to securely submit the final Redstone oracle price.
5. **Distribution:** The keeper triggers `distributeWinnings` to automatically payout the winners based on the pool ratio.

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

**2. Run the Keeper Bot:**
The Keeper Bot will automatically process any open markets whose deadlines have passed.

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
