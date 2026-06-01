// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

interface IUUPS {
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
}

/**
 * @notice Upgrades the live ZeroSightMarket proxy from V2 to V3 and runs
 *         migrateV3 atomically (initialises Pausable + sets oracle staleness).
 *
 *         Required env:
 *           - UPGRADER_PRIVATE_KEY     current proxy owner (must equal owner())
 *           - PROXY_ADDRESS            live proxy address
 *           - MAX_ORACLE_DELAY_SECS    max accepted Redstone price age (e.g. 180).
 *                                      Pass 0 to disable the staleness check.
 */
contract UpgradeToV3 is Script {
    function run() external {
        uint256 upgraderPk = vm.envUint("UPGRADER_PRIVATE_KEY");
        address payable proxyAddress = payable(vm.envAddress("PROXY_ADDRESS"));
        uint256 maxOracleDelay = vm.envOr("MAX_ORACLE_DELAY_SECS", uint256(180));

        vm.startBroadcast(upgraderPk);

        ZeroSightMarket newImpl = new ZeroSightMarket();
        console.log("New V3 implementation:", address(newImpl));

        bytes memory migrateCall = abi.encodeWithSelector(
            ZeroSightMarket.migrateV3.selector,
            maxOracleDelay
        );

        IUUPS(proxyAddress).upgradeToAndCall(address(newImpl), migrateCall);
        console.log("Proxy upgraded to V3 + migrated.");
        console.log("Proxy:", proxyAddress);
        console.log("maxOracleDelaySeconds:", maxOracleDelay);

        vm.stopBroadcast();
    }
}
