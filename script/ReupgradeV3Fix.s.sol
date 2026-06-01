// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

interface IUUPS {
    function upgradeTo(address newImplementation) external;
}

/**
 * @notice Hotfix re-upgrade: points the proxy at a corrected V3 implementation
 *         WITHOUT calling any migration (migrateV3's reinitializer(3) is already
 *         consumed). This repairs the storage layout after the bad V3 impl that
 *         inherited PausableUpgradeable mid-list and shifted all later slots.
 *
 *         The corrected impl uses a manually-appended `_paused` bool, so the
 *         V2 storage (signers, markets, feeds, roles) lines up again.
 *
 *         Required env:
 *           - UPGRADER_PRIVATE_KEY  current proxy owner
 *           - PROXY_ADDRESS         live proxy address
 */
contract ReupgradeV3Fix is Script {
    function run() external {
        uint256 upgraderPk = vm.envUint("UPGRADER_PRIVATE_KEY");
        address payable proxyAddress = payable(vm.envAddress("PROXY_ADDRESS"));

        vm.startBroadcast(upgraderPk);

        ZeroSightMarket newImpl = new ZeroSightMarket();
        console.log("Corrected V3 implementation:", address(newImpl));

        IUUPS(proxyAddress).upgradeTo(address(newImpl));
        console.log("Proxy re-pointed to corrected V3 impl (no migration).");

        vm.stopBroadcast();
    }
}
