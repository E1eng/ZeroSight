# Keeper Bot

A single Node process with an explicit per-asset state machine. It drives every market through its lifecycle off-chain.

## Module layout

```
script/markets/keeper/
├── types.ts          # asset registry + phase types
├── logger.ts         # structured logs (JSON lines in prod, pretty in TTY)
├── clients.ts        # ethers + viem + CDR clients; RPC failover provider
├── nonce.ts          # nonce manager (fresh per-tx, serialised — no collisions)
├── send-tx.ts        # resilient sender: wait-with-timeout + replace-by-fee gas bump
├── onchain-read.ts   # snapshot reads (status, bettors, signers) — block-timestamp based
├── onchain-write.ts  # gas-aware txs, Redstone-wrapped where needed
├── schedule.ts       # UTC-safe deadline math
├── decrypt.ts        # CDR decrypt with retry/backoff + on-chain bettor validation
├── state-machine.ts  # per-asset FSM: at most ONE privileged tx per tick
├── health.ts         # /health + /status HTTP server
└── alert.ts          # webhook alerting (Discord/Slack), rate-limited
```

## Reliability properties

- **No nonce collisions** — every tx fetches a fresh `pending` nonce inside a serialised lock; the previous tx is awaited to confirmation before the next starts. Survives keeper restarts and slow RPCs.
- **No stuck-tx deadlock** — `send-tx.ts` waits for the receipt with a hard timeout. If a tx doesn't confirm in time it is **resubmitted with the same nonce and bumped gas** (replace-by-fee); whichever lands first wins. A single underpriced tx can no longer hang the whole keeper.
- **RPC failover** — `FallbackProvider` rotates across `STORY_RPC_URL` + `STORY_RPC_FALLBACKS` (comma-separated).
- **UTC scheduling** — deadlines computed from `block.timestamp` (fetched **once per loop** and shared across all assets), immune to local clock drift.
- **Parallel staggered reveal** — decrypts a small batch per tick across the locked window, with **bounded concurrency** (`KEEPER_DECRYPT_CONCURRENCY`) inside each batch so slow CDR round-trips don't serialise past the window. Unrevealed-bet reads also run with bounded concurrency (`KEEPER_READ_CONCURRENCY`).
- **One tx per tick** — bounded concurrency; an in-flight loop is skipped (`loop.skipOverlapping`) rather than stacked.
- **Graceful shutdown** — SIGINT/SIGTERM let the in-flight tick settle before exit (no half-sent txs).
- **Alerting** — failed settlement-critical ops fire a rate-limited webhook.

## Run

```bash
# foreground (dev)
npm run keeper

# managed (prod) — auto-restart on crash/hang
npm run keeper:pm2
npm run keeper:pm2:logs
```

Docker:

```bash
docker build -f Dockerfile.keeper -t zerosight-keeper .
docker run --restart=unless-stopped --env-file .env -p 8787:8787 zerosight-keeper
```

## Observability

With `KEEPER_HEALTH_PORT` set:

- `GET /health` → `200` if ticked within `KEEPER_STALL_MS`, else `503` (supervisors can bounce a hung process).
- `GET /status` → per-asset phase, round, deadline, last error (JSON).

```bash
curl -s localhost:8787/status | jq
```

## Tuning (env)

| Var | Default | Purpose |
|-----|---------|---------|
| `KEEPER_INTERVAL_MS` | 15000 | tick interval |
| `STORY_RPC_FALLBACKS` | — | comma-separated backup RPCs |
| `KEEPER_HEALTH_PORT` | — | health server port (unset = disabled) |
| `KEEPER_STALL_MS` | 120000 | stall threshold for `/health` |
| `KEEPER_ALERT_WEBHOOK` | — | Discord/Slack webhook |
| `KEEPER_TX_TIMEOUT_MS` | 45000 | per-attempt wait before a gas-bumped resubmit |
| `KEEPER_TX_MAX_ATTEMPTS` | 3 | max submit attempts per tx (replace-by-fee) |
| `KEEPER_GAS_BUMP_PERCENT` | 30 | gas increase per retry |
| `KEEPER_TX_CONFIRMATIONS` | 1 | confirmations required before a tx is "done" |
| `KEEPER_DECRYPT_CONCURRENCY` | 4 | max simultaneous CDR decryptions per batch |
| `KEEPER_READ_CONCURRENCY` | 8 | max simultaneous `getUserBets` reads |
