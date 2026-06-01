# Security Model & Design Notes

## Blind to others, not to yourself

Choices are hidden from **other** users (anti copy-trading / front-running), not from the bettor. The contract never sees a choice until reveal. The frontend shows you your own pick (kept in `localStorage`) while the market stays blind to everyone else.

## Role separation

| Role | Can | Cannot |
|------|-----|--------|
| owner (cold) | upgrade, rotate roles, configure, pause | — |
| keeper (hot) | run lifecycle ops | upgrade, withdraw fees, rotate roles |
| treasury | receive fees | anything else |

A compromised keeper key can be rotated by the owner in one tx and never had upgrade or fee-withdraw rights.

## Keeper trust (current limitation)

Today the keeper decrypts vaults and submits the revealed choices. A compromised keeper key **cannot** upgrade the contract or steal fees, but it **is** currently trusted to report choices honestly. Censorship (not revealing a bet) is mitigated: unrevealed bets are auto-refunded at distribution.

### Future: trustless reveal (signed-choice / self-reveal)

Make reveal trustless without changing the CDR privacy model:

1. **At bet time** the user signs an EIP-712 message `{ vaultId, assetIndex, roundId, direction }`. The signature is stored in the CDR vault alongside the choice.
2. **At reveal** `revealChoices` takes the signatures and verifies each with `ecrecover(hash, sig) == bettor`. A keeper that flips a choice produces an invalid signature → the reveal reverts (or skips that bet → refund).
3. **Self-reveal** — because the user already holds `(direction, signature)` locally, they can reveal their own bet directly if the keeper is offline, removing the keeper from the critical path entirely.

This is planned as a separate upgrade (V4). It touches contract + keeper + frontend + CDR payload and changes the `revealChoices` signature, so it is intentionally not bundled with the V3 safety upgrade.

## Oracle

Resolution uses Redstone signed prices with an authorised signer set and a configurable signer threshold. V3 adds a staleness guard (`maxOracleDelaySeconds`) that rejects prices reported too long before resolution.

## Testnet disclaimer

Aeneid is **testnet** — not production-grade confidentiality. Do not store real secrets in CDR vaults here.
