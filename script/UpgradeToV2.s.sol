// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

interface IUUPS {
    function upgradeTo(address newImplementation) external;
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
}

/**
 * @notice Upgrades the live ZeroSightMarket proxy from V1 to V2 atomically and
 *         optionally transfers ownership to a separate cold wallet (recommended:
 *         the keeper key stops being owner after this).
 *
 *         Required env:
 *           - UPGRADER_PRIVATE_KEY        current proxy owner (must equal owner())
 *           - PROXY_ADDRESS               live proxy address
 *           - STORY_FEED_ID               bytes32, IP feed
 *           - BTC_FEED_ID                 bytes32, BTC feed
 *           - ETH_FEED_ID                 bytes32, ETH feed
 *           - KEEPER_ADDRESS              hot wallet for lifecycle ops
 *           - TREASURY_ADDRESS            fee recipient; address(0) defaults to owner
 *           - NEW_OWNER_ADDRESS           (optional) transfer ownership to this address
 *                                         after migration. address(0) keeps current owner.
 */
contract UpgradeToV2 is Script {
    function run() external {
        uint256 upgraderPk = vm.envUint("UPGRADER_PRIVATE_KEY");
        address payable proxyAddress = payable(vm.envAddress("PROXY_ADDRESS"));
        bytes32 ipFeedId = vm.envBytes32("STORY_FEED_ID");
        bytes32 btcFeedId = vm.envBytes32("BTC_FEED_ID");
        bytes32 ethFeedId = vm.envBytes32("ETH_FEED_ID");
        address keeperAddr = vm.envAddress("KEEPER_ADDRESS");
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", address(0));
        address newOwner = vm.envOr("NEW_OWNER_ADDRESS", address(0));

        vm.startBroadcast(upgraderPk);

        ZeroSightMarket newImpl = new ZeroSightMarket();
        console.log("New V2 implementation:", address(newImpl));

        bytes memory migrateCall = abi.encodeWithSelector(
            ZeroSightMarket.migrateV2.selector,
            ipFeedId,
            btcFeedId,
            ethFeedId,
            keeperAddr,
            treasuryAddr
        );

        IUUPS(proxyAddress).upgradeToAndCall(address(newImpl), migrateCall);
        console.log("Proxy upgraded to V2 + migrated.");
        console.log("Proxy:", proxyAddress);
        console.log("Keeper:", keeperAddr);

        if (newOwner != address(0)) {
            OwnableUpgradeable(proxyAddress).transferOwnership(newOwner);
            console.log("Ownership transferred to:", newOwner);
        } else {
            console.log("Ownership unchanged.");
        }

        vm.stopBroadcast();
    }
}
