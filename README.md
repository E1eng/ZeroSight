# ZeroSight Protocol 🕶️

A **blind parimutuel prediction market** on the Story Protocol Aeneid Testnet. Bettor choices (Up/Down) are encrypted client-side with the **Story CDR (Confidential Data Rails) SDK** and stored in threshold-encrypted vaults. No one not even the smart contract can see a bet until the market resolves, which prevents copy-trading and front-running.

The on-chain contract only ever sees the **bet amount** and a **CDR vault UUID**. The choice is revealed and verified only after the betting deadline.

## Highlights

- 🔒 **Shielded bets** via Story CDR threshold encryption
- ⏱ **Time-weighted shares** (up to 2x for early bets)
- 🏦 **2% protocol fee** to a separate treasury
- 🔑 **Role split** (owner / keeper / treasury) — a compromised hot key can't upgrade or drain
- 🛡 **Pausable** + **oracle staleness guard** + property-tested payout accounting
- 🤖 **Autonomous keeper** — RPC failover, replace-by-fee gas bumps, parallel CDR decryption, health checks, and structured logs

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | System overview, market lifecycle, target thresholds, round indexing |
| [docs/contract.md](docs/contract.md) | Contract versions, roles, invariants, safety mechanisms, deployed addresses |
| [docs/keeper.md](docs/keeper.md) | Keeper module layout, reliability properties, observability, tuning |
| [docs/deployment.md](docs/deployment.md) | Fresh deploy + V1→V2→V3 upgrade commands and verification |
| [docs/hosting.md](docs/hosting.md) | Frontend on Netlify + keeper on a VPS (PM2 / Docker) |
| [docs/runbook.md](docs/runbook.md) | Ops: restart, pause, rotate keeper, settle stuck rounds |
| [docs/demo-script.md](docs/demo-script.md) | Recordable 2–3 min product walkthrough |
| [docs/security.md](docs/security.md) | Trust model, keeper limitation, planned trustless reveal (V4) |

## Quick start

### Prerequisites
- Node.js **22+**
- Foundry (`forge`, `cast`)

### Setup
```bash
cp .env.example .env      # fill in keys + config (see comments in the file)
forge install             # contract deps
npm install               # frontend + keeper deps
```

### Build & test contracts
```bash
forge build
forge test                # 33 unit + fuzz/invariant tests
```

### Run the frontend
```bash
npm run dev
```

### Run the keeper
```bash
npm run keeper            # dev (foreground)
npm run keeper:pm2        # prod (auto-restart via pm2)
```

## Tech stack

- **Contracts:** Solidity 0.8.25, Foundry, OpenZeppelin UUPS
- **Frontend:** Next.js 14, Tailwind CSS, Privy, viem, Recharts, TanStack Query
- **Confidentiality:** Story Protocol CDR SDK (`@piplabs/cdr-sdk`)
- **Oracles:** Redstone Finance (`@redstone-finance/evm-connector`)
- **Keeper:** Node + ethers v5 + tsx (pm2 / Docker)

## Deployed (Aeneid testnet)

Proxy: `0x570288C778b6A3ecD22c517f327c7635d817dC2e` · Chain ID `1315`

> Aeneid is testnet — not production-grade confidentiality. Don't store real secrets.
