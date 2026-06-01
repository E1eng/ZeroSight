# Operations Runbook

Common operational tasks. All `cast`/`forge` commands assume:

```bash
cd /path/to/ZeroSight && set -a && source .env && set +a && export PATH=$HOME/.foundry/bin:$PATH
PROXY=0x570288C778b6A3ecD22c517f327c7635d817dC2e
```

## Restart the keeper

```bash
# pm2-managed
pm2 restart zerosight-keeper && pm2 logs zerosight-keeper

# Docker
docker restart <container>

# foreground
# Ctrl+C, then: npm run keeper
```

The keeper is stateless across restarts — it rebuilds each asset's phase from on-chain state, so a restart mid-round is safe.

## Check keeper health

```bash
curl -s localhost:8787/health   # 200 healthy / 503 stalled
curl -s localhost:8787/status | jq
```

## Pause / unpause betting (incident response)

```bash
cast send $PROXY 'pause()'   --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
cast send $PROXY 'unpause()' --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
```

Pause stops new bets only; in-flight rounds still reveal/resolve/distribute.

## Rotate the keeper key (suspected compromise)

1. Generate a new hot wallet, fund it with testnet IP.
2. Point the contract at it (owner only):
   ```bash
   cast send $PROXY 'setKeeper(address)' 0xNEWKEEPER \
     --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
   ```
3. Update `MARKET_OPERATOR_PRIVATE_KEY` + `KEEPER_ADDRESS` in `.env`, restart the keeper.

The old key instantly loses all lifecycle powers. It never had upgrade or fee-withdraw rights (role split).

## Tune oracle staleness window

```bash
# e.g. relax to 5 minutes if resolves fail with "Oracle price stale"
cast send $PROXY 'setMaxOracleDelay(uint256)' 300 \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
```

## Manually settle a stuck round

If the keeper is down but a round must settle, run the lifecycle calls directly with the keeper (or owner) key. Use the Redstone wrapper for `resolveMarket` / `startNextMarket` — easiest via the keeper process; otherwise the raw calls are:

```bash
cast send $PROXY 'lockMarket(uint8)' <assetIndex> --private-key "$MARKET_OPERATOR_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
# revealChoices / resolveMarket need decrypted choices + Redstone calldata — prefer restarting the keeper.
cast send $PROXY 'distributeWinnings(uint8,uint256)' <assetIndex> 50 --private-key "$MARKET_OPERATOR_PRIVATE_KEY" --rpc-url "$STORY_RPC_URL" --legacy --gas-price 2000000000
```

Unrevealed bets are auto-refunded during distribution, so a partially-revealed round still settles fairly.

## Inspect a market's state

```bash
cast call $PROXY 'markets(uint8)(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)' 0 --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'currentRoundId(uint8)(uint256)' 0 --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'getBettorCount(uint8)(uint256)' 0 --rpc-url "$STORY_RPC_URL"
```

Tuple order: `status, category, totalPool, openedAt, deadline, openingPrice, resolvedPrice, winningChoice, payoutPool, winningSharesTotal, distributionIndex`.
