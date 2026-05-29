// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZeroSightMarket} from "src/ZeroSightMarket.sol";

contract DeployZeroSightMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        bytes32 ipFeedId = vm.envBytes32("STORY_FEED_ID");
        bytes32 btcFeedId = vm.envBytes32("BTC_FEED_ID");
        bytes32 ethFeedId = vm.envBytes32("ETH_FEED_ID");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the implementation contract.
        ZeroSightMarket implementation = new ZeroSightMarket();
        console.log("Implementation:", address(implementation));

        // 2. Encode the initializer call.
        bytes memory initData = abi.encodeWithSelector(
            ZeroSightMarket.initialize.selector,
            ipFeedId,
            btcFeedId,
            ethFeedId
        );

        // 3. Deploy the ERC1967 proxy.
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy (use this address):", address(proxy));

        vm.stopBroadcast();
    }
}
