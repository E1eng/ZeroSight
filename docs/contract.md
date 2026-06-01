# Smart Contract — `ZeroSightMarket`

UUPS-upgradeable (OpenZeppelin). No constructor; initialized behind an `ERC1967Proxy`. A reserved `__gap` keeps storage append-safe for future upgrades.

## Versions

| Version | Migration | Adds |
|---------|-----------|------|
| V1 | `initialize` | Base parimutuel market, Redstone oracle, time-weighted shares |
| V2 | `migrateV2` | Per-asset `roundId`; `vaultId`+`roundId` in events; `MarketOpened`; configurable `targetBps`; daily-feed config; **role split** (owner/keeper/treasury); extended category enum |
| V3 | `migrateV3` | Emergency **pause** (`PausableUpgradeable`); **oracle staleness guard** (`maxOracleDelaySeconds`) |

Migrations use OpenZeppelin's `reinitializer(n)` so they run exactly once and in order.

## Roles

The three privileged roles are separated so a compromised hot key cannot drain or upgrade the protocol.

| Role | Powers | Key type |
|------|--------|----------|
| **owner** | upgrade, rotate keeper/treasury, configure feeds/targets/oracle-delay, pause | cold |
| **keeper** | `startNextMarket` / `lockMarket` / `revealChoices` / `resolveMarket` / `distributeWinnings` / `sweepUnclaimed` | hot (rotatable via `setKeeper`, no upgrade needed) |
| **treasury** | receives the 2% protocol fee | cold (defaults to owner) |

## Key invariants (property-tested)

- Total payouts of a resolved round never exceed the round's pool.
- The contract never underflows its own balance.
- Pool conservation: winners + refunds + fee + swept == original pool.
- A losing-direction bettor never receives a payout.
- An unrevealed bet is always refunded (capped by post-fee pool).

See `test/ZeroSightMarketInvariant.t.sol` (256 fuzz runs per property).

## Safety mechanisms

- **Pause** — `pause()` halts `placeBet` only. Lifecycle ops still run so in-flight rounds settle cleanly.
- **Oracle staleness** — `resolveMarket` rejects a Redstone price whose package timestamp is older than `maxOracleDelaySeconds` (0 = disabled). Enforced via an overridden `validateTimestamp`.
- **Anti-griefing distribution** — batched, push-safe `call{value:…}("")`; a reverting recipient cannot halt the cycle.
- **Reentrancy guard** on distribution.
- **Validated setters** — feed IDs and asset indices are range/zero-checked.

## Deployed (Aeneid testnet)

| Item | Value |
|------|-------|
| Proxy | `0x570288C778b6A3ecD22c517f327c7635d817dC2e` |
| Chain ID | `1315` |
| Redstone feed IDs | `IP` / `BTC` / `ETH` (bytes32 ASCII) |

## Tests

```bash
forge test                                              # full suite
forge test --match-path test/ZeroSightMarketInvariant.t.sol  # fuzz/property only
```
