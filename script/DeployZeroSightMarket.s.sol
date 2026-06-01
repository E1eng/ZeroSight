// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

/**
 * @notice Fresh deploy: implementation -> ERC1967Proxy -> initialize -> migrateV2.
 *         Run only when standing up a brand new proxy. For an existing proxy use
 *         UpgradeToV2.s.sol instead.
 *
 *         Required env:
 *           - DEPLOYER_PRIVATE_KEY        (becomes proxy owner)
 *           - STORY_FEED_ID               (bytes32, IP feed)
 *           - BTC_FEED_ID                 (bytes32, BTC feed)
 *           - ETH_FEED_ID                 (bytes32, ETH feed)
 *           - KEEPER_ADDRESS              (hot wallet for lifecycle ops)
 *           - TREASURY_ADDRESS            (fee recipient; pass 0x0...0 to default to owner)
 */
contract DeployZeroSightMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        bytes32 ipFeedId = vm.envBytes32("STORY_FEED_ID");
        bytes32 btcFeedId = vm.envBytes32("BTC_FEED_ID");
        bytes32 ethFeedId = vm.envBytes32("ETH_FEED_ID");
        address keeperAddr = vm.envAddress("KEEPER_ADDRESS");
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        ZeroSightMarket implementation = new ZeroSightMarket();
        console.log("Implementation:", address(implementation));

        bytes memory initData = abi.encodeWithSelector(
            ZeroSightMarket.initialize.selector,
            ipFeedId,
            btcFeedId,
            ethFeedId
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy (use this address):", address(proxy));

        ZeroSightMarket(payable(address(proxy))).migrateV2(
            ipFeedId,
            btcFeedId,
            ethFeedId,
            keeperAddr,
            treasuryAddr
        );
        console.log("V2 migration complete.");
        console.log("Keeper:", keeperAddr);
        console.log("Treasury:", treasuryAddr == address(0) ? "owner (default)" : "custom");

        vm.stopBroadcast();
    }
}
