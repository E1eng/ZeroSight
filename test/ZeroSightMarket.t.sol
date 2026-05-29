// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ZeroSightMarket.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Mock the Redstone Consumer Base to bypass timestamp and oracle signature validation in tests
contract MockZeroSightMarket is ZeroSightMarket {
    uint256 public mockOraclePrice;

    function setMockOraclePrice(uint256 price) external {
        mockOraclePrice = price;
    }

    // Override the internal call to return our mock price instead of verifying signatures
    function getOracleNumericValueFromTxMsg(bytes32 /* dataFeedId */) internal view override returns (uint256) {
        return mockOraclePrice;
    }
}

contract ZeroSightMarketTest is Test {
    MockZeroSightMarket public market;
    
    address public owner = address(1);
    address public bettor1 = address(2);
    address public bettor2 = address(3);
    address public bettor3 = address(4);

    bytes32 constant IP_FEED = bytes32("STORY_IP");
    bytes32 constant BTC_FEED = bytes32("BTC");
    bytes32 constant ETH_FEED = bytes32("ETH");

    function setUp() public {
        vm.startPrank(owner);

        // Deploy implementation
        MockZeroSightMarket impl = new MockZeroSightMarket();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            ZeroSightMarket.initialize.selector,
            IP_FEED,
            BTC_FEED,
            ETH_FEED
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        
        market = MockZeroSightMarket(payable(address(proxy)));

        vm.deal(bettor1, 10 ether);
        vm.deal(bettor2, 10 ether);
        vm.deal(bettor3, 10 ether);
        
        vm.stopPrank();
    }

    function testInitialization() public view {
        assertEq(market.owner(), owner);
        assertEq(uint(market.marketStatus()), uint(ZeroSightMarket.MarketStatus.Resolved)); // Initial state is resolved so startNextMarket can be called
    }

    function testStartNextMarket() public {
        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8); // $1000
        
        uint256 deadline = block.timestamp + 1 hours;
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, deadline);
        
        assertEq(uint(market.marketStatus()), uint(ZeroSightMarket.MarketStatus.Open));
        assertEq(market.openingPrice(), 1000 * 10**8);
        assertEq(market.deadline(), deadline);
        assertEq(market.activeAsset(), 0);
        vm.stopPrank();
    }

    function testPlaceBet() public {
        testStartNextMarket();

        vm.startPrank(bettor1);
        market.placeBet{value: 1 ether}("vault-123", 0);
        vm.stopPrank();

        assertEq(market.totalPool(), 1 ether);
        assertEq(market.getBettorCount(), 1);
        
        ZeroSightMarket.BetInfo[] memory bets = market.getUserBets(bettor1);
        assertEq(bets.length, 1);
        assertEq(bets[0].amount, 1 ether);
        assertEq(bets[0].vaultId, "vault-123");
        assertEq(bets[0].choiceRevealed, false);
    }

    function testRevertPlaceBetWrongAsset() public {
        testStartNextMarket();

        vm.startPrank(bettor1);
        vm.expectRevert("Inactive asset");
        market.placeBet{value: 1 ether}("vault-123", 1); // Asset 1 when market is 0
        vm.stopPrank();
    }

    function testRevertPlaceBetAfterDeadline() public {
        testStartNextMarket();

        vm.warp(block.timestamp + 2 hours); // Past deadline

        vm.startPrank(bettor1);
        vm.expectRevert("Betting closed");
        market.placeBet{value: 1 ether}("vault-123", 0);
        vm.stopPrank();
    }

    function testRevealChoices() public {
        testStartNextMarket();

        // Place bets
        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-1", 0);
        
        vm.prank(bettor2);
        market.placeBet{value: 2 ether}("vault-2", 0);

        // Advance time past deadline
        vm.warp(block.timestamp + 2 hours);

        // Reveal choices
        address[] memory bettors = new address[](2);
        bettors[0] = bettor1;
        bettors[1] = bettor2;

        string[] memory vaultIds = new string[](2);
        vaultIds[0] = "vault-1";
        vaultIds[1] = "vault-2";

        uint8[] memory choices = new uint8[](2);
        choices[0] = 1; // Up
        choices[1] = 0; // Down

        vm.prank(owner);
        market.revealChoices(bettors, vaultIds, choices);

        assertEq(market.totalStakeByChoice(1), 1 ether);
        assertEq(market.totalStakeByChoice(0), 2 ether);
        assertEq(uint(market.marketStatus()), uint(ZeroSightMarket.MarketStatus.Locked));

        ZeroSightMarket.BetInfo[] memory bets1 = market.getUserBets(bettor1);
        assertEq(bets1[0].choiceRevealed, true);
        assertEq(bets1[0].direction, 1);
    }

    function testResolveMarketAndDistribute() public {
        testRevealChoices(); // Sets up bets: bettor1 (1 ETH, Up), bettor2 (2 ETH, Down)

        vm.startPrank(owner);
        
        // Resolve market: Price went up!
        market.setMockOraclePrice(1100 * 10**8); // $1100 > $1000 opening
        market.resolveMarket();

        assertEq(uint(market.marketStatus()), uint(ZeroSightMarket.MarketStatus.Resolved));
        assertEq(market.winningChoice(), 1); // 1 = Up
        assertEq(market.payoutPool(), 3 ether);
        assertEq(market.winningStakeTotal(), 1 ether);

        // Distribute winnings
        uint256 bettor1BalBefore = bettor1.balance;
        
        market.distributeWinnings(10);
        
        assertTrue(market.isFullyDistributed());

        // Bettor1 should get entire pool (3 ETH) because they were the only winner
        uint256 bettor1BalAfter = bettor1.balance;
        assertEq(bettor1BalAfter - bettor1BalBefore, 3 ether);
        
        vm.stopPrank();
    }

    function testSweepUnclaimedNoWinners() public {
        testStartNextMarket();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-1", 0);

        vm.warp(block.timestamp + 2 hours);

        address[] memory bettors = new address[](1);
        bettors[0] = bettor1;
        
        string[] memory vaultIds = new string[](1);
        vaultIds[0] = "vault-1";

        uint8[] memory choices = new uint8[](1);
        choices[0] = 1; // Up

        vm.prank(owner);
        market.revealChoices(bettors, vaultIds, choices);

        // Resolve market: Price went DOWN
        vm.prank(owner);
        market.setMockOraclePrice(900 * 10**8); // $900 < $1000
        vm.prank(owner);
        market.resolveMarket();

        assertEq(market.winningChoice(), 0); // Down
        assertEq(market.winningStakeTotal(), 0); // Nobody bet down!

        vm.prank(owner);
        market.distributeWinnings(10);

        uint256 ownerBalBefore = owner.balance;

        vm.prank(owner);
        market.sweepUnclaimed();

        uint256 ownerBalAfter = owner.balance;
        assertEq(ownerBalAfter - ownerBalBefore, 1 ether); // Owner gets the unclaimed pool
    }
}
