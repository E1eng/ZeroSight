# Keeper Bot

A single Node process with an explicit per-asset state machine. It drives every market through its lifecycle off-chain.

## Module layout

```
script/markets/keeper/
├── types.ts          # asset registry + phase types
├── logger.ts         # structured logs (JSON lines in prod, pretty in TTY)
├── clients.ts        # ethers + viem + CDR clients; RPC failover provider
├── nonce.ts          # nonce manager (fresh per-tx, serialised — no collisions)
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
- **RPC failover** — `FallbackProvider` rotates across `STORY_RPC_URL` + `STORY_RPC_FALLBACKS` (comma-separated).
- **UTC scheduling** — deadlines computed from `block.timestamp`, immune to local clock drift.
- **Staggered reveal** — decrypts a small batch per tick across the locked window instead of one giant blocking decrypt; keeps all 6 markets progressing.
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
| `HOURLY_OPEN_SECONDS` | 240 | hourly betting window |
| `HOURLY_LOCK_SECONDS` | 60 | hourly lock→resolve gap |
| `STORY_RPC_FALLBACKS` | — | comma-separated backup RPCs |
| `KEEPER_HEALTH_PORT` | — | health server port (unset = disabled) |
| `KEEPER_STALL_MS` | 120000 | stall threshold for `/health` |
| `KEEPER_ALERT_WEBHOOK` | — | Discord/Slack webhook |
