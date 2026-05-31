// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

interface IUUPS {
    function upgradeTo(address newImplementation) external;
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
}

contract UpgradeZeroSightMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        // Gunakan alamat Proxy yang aktif saat ini dari .env
        address payable proxyAddress = payable(0x570288C778b6A3ecD22c517f327c7635d817dC2e);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the new implementation
        ZeroSightMarket newImplementation = new ZeroSightMarket();
        console.log("New Implementation:", address(newImplementation));

        // 2. Upgrade the proxy to point to the new implementation
        IUUPS(proxyAddress).upgradeTo(address(newImplementation));
        console.log("Proxy successfully upgraded!");

        // 3. Update the Feed ID for IP to "IP", BTC to "BTC", and ETH to "ETH"
        ZeroSightMarket(proxyAddress).setFeedConfig(0, 0x4950000000000000000000000000000000000000000000000000000000000000);
        console.log("Updated Feed ID for IP!");
        ZeroSightMarket(proxyAddress).setFeedConfig(1, 0x4254430000000000000000000000000000000000000000000000000000000000);
        console.log("Updated Feed ID for BTC!");
        ZeroSightMarket(proxyAddress).setFeedConfig(2, 0x4554480000000000000000000000000000000000000000000000000000000000);
        console.log("Updated Feed ID for ETH!");

        vm.stopBroadcast();
    }
}
