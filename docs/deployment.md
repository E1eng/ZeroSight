# Deployment & Upgrades

All Foundry scripts read keys/config from `.env`. Private keys **must** include the `0x` prefix (Foundry's `vm.envUint` requires it).

> Aeneid's auto gas estimate can be too low and leave txs stuck pending. Always pass `--legacy --with-gas-price 2000000000` (2 gwei) and `--slow`.

## Fresh deploy (new proxy)

```bash
KEEPER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
forge script script/DeployZeroSightMarket.s.sol \
  --rpc-url "$STORY_RPC_URL" --broadcast --legacy --with-gas-price 2000000000
```

Then set `NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS` to the printed proxy address.

## Upgrade V1 → V2 (role split, round indexing)

```bash
UPGRADER_PRIVATE_KEY="0x${MARKET_OPERATOR_PRIVATE_KEY#0x}" \
PROXY_ADDRESS=0x570288C778b6A3ecD22c517f327c7635d817dC2e \
KEEPER_ADDRESS=0x...    TREASURY_ADDRESS=0x...   NEW_OWNER_ADDRESS=0x... \
STORY_FEED_ID=0x4950...  BTC_FEED_ID=0x4254...  ETH_FEED_ID=0x4554... \
forge script script/UpgradeToV2.s.sol \
  --rpc-url "$STORY_RPC_URL" --broadcast --legacy --with-gas-price 2000000000 --slow
```

`UPGRADER_PRIVATE_KEY` must be the **current** proxy owner. `NEW_OWNER_ADDRESS` (optional) transfers ownership at the end — used to move owner to a cold key after migration.

## Upgrade V2 → V3 (pause + oracle staleness)

After V2, ownership is the cold owner, so upgrade with that key:

```bash
UPGRADER_PRIVATE_KEY="0x${DEPLOYER_PRIVATE_KEY#0x}" \
PROXY_ADDRESS=0x570288C778b6A3ecD22c517f327c7635d817dC2e \
MAX_ORACLE_DELAY_SECS=180 \
forge script script/UpgradeToV3.s.sol \
  --rpc-url "$STORY_RPC_URL" --broadcast --legacy --with-gas-price 2000000000 --slow
```

## Post-upgrade verification

```bash
cast call $PROXY 'owner()(address)'                 --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'keeper()(address)'                --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'treasury()(address)'              --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'maxOracleDelaySeconds()(uint256)' --rpc-url "$STORY_RPC_URL"
cast call $PROXY 'paused()(bool)'                   --rpc-url "$STORY_RPC_URL"
```
