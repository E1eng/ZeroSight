// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ZeroSightMarket.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Mocks Redstone oracle reads so we can test contract logic in isolation.
contract MockZeroSightMarket is ZeroSightMarket {
    uint256 public mockOraclePrice;

    function setMockOraclePrice(uint256 price) external {
        mockOraclePrice = price;
    }

    function getOracleNumericValueFromTxMsg(bytes32 /* dataFeedId */)
        internal
        view
        override
        returns (uint256)
    {
        return mockOraclePrice;
    }

    // Bypass Redstone timestamp validation in unit tests (no real packages).
    function validateTimestamp(uint256) public view override {}
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

        MockZeroSightMarket impl = new MockZeroSightMarket();
        bytes memory initData = abi.encodeWithSelector(
            ZeroSightMarket.initialize.selector,
            IP_FEED,
            BTC_FEED,
            ETH_FEED
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        market = MockZeroSightMarket(payable(address(proxy)));

        // Run V2 migration so daily-market feeds and targetBps are seeded.
        // Owner is keeper (single-wallet path); treasury defaults to owner.
        market.migrateV2(IP_FEED, BTC_FEED, ETH_FEED, owner, address(0));

        // Run V3 migration: init Pausable + oracle staleness (disabled in tests).
        market.migrateV3(0);

        vm.deal(bettor1, 10 ether);
        vm.deal(bettor2, 10 ether);
        vm.deal(bettor3, 10 ether);

        vm.stopPrank();
    }

    // ─── Helpers (positional getter into the public markets() mapping) ──

    function getStatus(uint8 assetIndex) internal view returns (ZeroSightMarket.MarketStatus s) {
        (s, , , , , , , , , , ) = market.markets(assetIndex);
    }

    function getOpeningPrice(uint8 assetIndex) internal view returns (uint256 v) {
        (, , , , , v, , , , , ) = market.markets(assetIndex);
    }

    function getDeadline(uint8 assetIndex) internal view returns (uint256 v) {
        (, , , , v, , , , , , ) = market.markets(assetIndex);
    }

    function getTotalPool(uint8 assetIndex) internal view returns (uint256 v) {
        (, , v, , , , , , , , ) = market.markets(assetIndex);
    }

    function getPayoutPool(uint8 assetIndex) internal view returns (uint256 v) {
        (, , , , , , , , v, , ) = market.markets(assetIndex);
    }

    function getWinningChoice(uint8 assetIndex) internal view returns (uint256 v) {
        (, , , , , , , v, , , ) = market.markets(assetIndex);
    }

    function getWinningSharesTotal(uint8 assetIndex) internal view returns (uint256 v) {
        (, , , , , , , , , v, ) = market.markets(assetIndex);
    }

    // ─── Tests: V2 invariants ───────────────────────────────────────────

    function testInitializationAllSixAssetsResolved() public view {
        for (uint8 i = 0; i < 6; i++) {
            assertEq(uint(getStatus(i)), uint(ZeroSightMarket.MarketStatus.Resolved));
        }
    }

    function testTargetBpsSeeded() public view {
        assertEq(market.targetBps(0), 75);
        assertEq(market.targetBps(1), 25);
        assertEq(market.targetBps(2), 40);
        assertEq(market.targetBps(3), 400);
        assertEq(market.targetBps(4), 150);
        assertEq(market.targetBps(5), 250);
    }

    function testRoundIdStartsAtZero() public view {
        for (uint8 i = 0; i < 6; i++) {
            assertEq(market.currentRoundId(i), 0);
        }
    }

    function testStartNextMarketBumpsRoundId() public {
        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8);

        uint256 deadline = block.timestamp + 1 hours;
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, deadline);

        assertEq(uint(getStatus(0)), uint(ZeroSightMarket.MarketStatus.Open));
        assertEq(getOpeningPrice(0), 1000 * 10**8);
        assertEq(getDeadline(0), deadline);
        assertEq(market.currentRoundId(0), 1);
        vm.stopPrank();
    }

    function testStartNextMarketWorksForDailyAssets() public {
        vm.startPrank(owner);
        market.setMockOraclePrice(50000 * 10**8);

        uint256 deadline = block.timestamp + 1 days;
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 4, deadline);

        assertEq(uint(getStatus(4)), uint(ZeroSightMarket.MarketStatus.Open));
        assertEq(market.currentRoundId(4), 1);
        vm.stopPrank();
    }

    function testInvalidAssetRevertsOnStart() public {
        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8);
        vm.expectRevert("Invalid asset");
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 6, block.timestamp + 1 hours);
        vm.stopPrank();
    }

    function testPlaceBet() public {
        testStartNextMarketBumpsRoundId();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-123", 0);

        assertEq(getTotalPool(0), 1 ether);
        assertEq(market.getBettorCount(0), 1);

        ZeroSightMarket.BetInfo[] memory bets = market.getUserBets(0, bettor1);
        assertEq(bets.length, 1);
        assertEq(bets[0].amount, 1 ether);
        assertEq(bets[0].vaultId, "vault-123");
        assertEq(bets[0].choiceRevealed, false);
    }

    function testPlaceBetEmitsRoundId() public {
        testStartNextMarketBumpsRoundId();

        vm.expectEmit(true, true, true, true);
        emit ZeroSightMarket.BetPlaced(bettor1, "vault-123", 0, 1, 1 ether);

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-123", 0);
    }

    function testRevertPlaceBetWrongAsset() public {
        testStartNextMarketBumpsRoundId();
        vm.prank(bettor1);
        vm.expectRevert("Market not open");
        market.placeBet{value: 1 ether}("vault-123", 1);
    }

    function testRevertPlaceBetAfterDeadline() public {
        testStartNextMarketBumpsRoundId();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(bettor1);
        vm.expectRevert("Betting closed");
        market.placeBet{value: 1 ether}("vault-123", 0);
    }

    function testRevertEmptyVault() public {
        testStartNextMarketBumpsRoundId();
        vm.prank(bettor1);
        vm.expectRevert("Vault required");
        market.placeBet{value: 1 ether}("", 0);
    }

    function testRevealChoices() public {
        testStartNextMarketBumpsRoundId();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-1", 0);
        vm.prank(bettor2);
        market.placeBet{value: 2 ether}("vault-2", 0);

        vm.warp(block.timestamp + 2 hours);

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
        market.revealChoices(0, bettors, vaultIds, choices);

        assertEq(market.getSharesByChoice(0, 1), 2 ether);
        assertEq(market.getSharesByChoice(0, 0), 4 ether);
        assertEq(uint(getStatus(0)), uint(ZeroSightMarket.MarketStatus.Locked));

        ZeroSightMarket.BetInfo[] memory b1 = market.getUserBets(0, bettor1);
        assertEq(b1[0].choiceRevealed, true);
        assertEq(b1[0].direction, 1);
    }

    function testResolveMarketAndDistribute() public {
        testRevealChoices();

        vm.startPrank(owner);
        market.setMockOraclePrice(1100 * 10**8); // > 1000 + 0.75% = 1007.5
        market.resolveMarket(0);

        assertEq(uint(getStatus(0)), uint(ZeroSightMarket.MarketStatus.Resolved));
        assertEq(getWinningChoice(0), 1);
        assertEq(getPayoutPool(0), 2.94 ether);
        assertEq(getWinningSharesTotal(0), 2 ether);

        uint256 bal = bettor1.balance;
        market.distributeWinnings(0, 10);

        assertTrue(market.isFullyDistributed(0));
        assertEq(bettor1.balance - bal, 2.94 ether);
        vm.stopPrank();
    }

    function testDistributeEmitsVaultId() public {
        testRevealChoices();

        vm.startPrank(owner);
        market.setMockOraclePrice(1100 * 10**8);
        market.resolveMarket(0);

        vm.expectEmit(true, true, true, true);
        emit ZeroSightMarket.WinningsDistributed(0, 1, bettor1, "vault-1", 2.94 ether);

        market.distributeWinnings(0, 10);
        vm.stopPrank();
    }

    function testRefundEmitsVaultId() public {
        // Place bet, never reveal.
        testStartNextMarketBumpsRoundId();
        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-orphan", 0);

        vm.warp(block.timestamp + 2 hours);

        vm.startPrank(owner);
        // Lock without revealing.
        market.lockMarket(0);

        market.setMockOraclePrice(1100 * 10**8);
        market.resolveMarket(0);

        vm.expectEmit(true, true, true, true);
        // bet.amount=1e18, but pool was 1e18 minus 2% fee = 0.98e18.
        emit ZeroSightMarket.BetRefunded(0, 1, bettor1, "vault-orphan", 0.98 ether);

        market.distributeWinnings(0, 10);
        vm.stopPrank();
    }

    function testSweepUnclaimedNoWinners() public {
        testStartNextMarketBumpsRoundId();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-1", 0);

        vm.warp(block.timestamp + 2 hours);

        address[] memory bettors = new address[](1);
        bettors[0] = bettor1;
        string[] memory vaultIds = new string[](1);
        vaultIds[0] = "vault-1";
        uint8[] memory choices = new uint8[](1);
        choices[0] = 1;

        vm.prank(owner);
        market.revealChoices(0, bettors, vaultIds, choices);

        vm.startPrank(owner);
        market.setMockOraclePrice(900 * 10**8);
        market.resolveMarket(0);

        assertEq(getWinningChoice(0), 0);
        assertEq(getWinningSharesTotal(0), 0);

        market.distributeWinnings(0, 10);
        uint256 ownerBalBefore = owner.balance;
        market.sweepUnclaimed(0);
        assertEq(owner.balance - ownerBalBefore, 0.98 ether);
        vm.stopPrank();
    }

    function testSetFeedConfigRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert("Invalid feed id");
        market.setFeedConfig(0, bytes32(0));
    }

    function testSetTargetBpsBounds() public {
        vm.prank(owner);
        vm.expectRevert("BPS out of range");
        market.setTargetBps(0, 0);

        vm.prank(owner);
        vm.expectRevert("BPS out of range");
        market.setTargetBps(0, 5001);

        vm.prank(owner);
        market.setTargetBps(0, 100); // 1%
        assertEq(market.targetBps(0), 100);
    }

    function testSetTargetBpsAffectsResolution() public {
        // Set IP target to +20% (very high). At 1100 < 1200, market should resolve Down.
        vm.prank(owner);
        market.setTargetBps(0, 2000);

        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-1", 0);

        vm.warp(block.timestamp + 2 hours);
        address[] memory bettors = new address[](1);
        bettors[0] = bettor1;
        string[] memory vaultIds = new string[](1);
        vaultIds[0] = "vault-1";
        uint8[] memory choices = new uint8[](1);
        choices[0] = 1;
        vm.prank(owner);
        market.revealChoices(0, bettors, vaultIds, choices);

        vm.startPrank(owner);
        market.setMockOraclePrice(1100 * 10**8);
        market.resolveMarket(0);
        vm.stopPrank();

        assertEq(getWinningChoice(0), 0); // Down (1100 < 1200)
    }

    function testMigrateV2RevertsOnSecondCall() public {
        vm.prank(owner);
        vm.expectRevert();
        market.migrateV2(IP_FEED, BTC_FEED, ETH_FEED, owner, address(0));
    }

    // ─── Tests: keeper / treasury role split ────────────────────────────

    function testKeeperAndTreasurySetByMigration() public view {
        assertEq(market.keeper(), owner);
        assertEq(market.treasury(), owner);
    }

    function testKeeperCanCallStartNextMarket() public {
        address keeperEoa = address(0xBEEF);
        vm.prank(owner);
        market.setKeeper(keeperEoa);

        vm.prank(owner);
        market.setMockOraclePrice(1000 * 10**8);

        vm.prank(keeperEoa);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);

        assertEq(uint(getStatus(0)), uint(ZeroSightMarket.MarketStatus.Open));
    }

    function testNonKeeperRejected() public {
        vm.prank(owner);
        market.setKeeper(address(0xBEEF));

        vm.prank(owner);
        market.setMockOraclePrice(1000 * 10**8);

        vm.prank(bettor1);
        vm.expectRevert("Not keeper or owner");
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
    }

    function testOwnerCanStillCallLifecycleAfterKeeperRotation() public {
        // Keeper rotated to a foreign address, owner must still be able to operate.
        vm.prank(owner);
        market.setKeeper(address(0xBEEF));

        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        assertEq(uint(getStatus(0)), uint(ZeroSightMarket.MarketStatus.Open));
    }

    function testFeeGoesToTreasuryNotOwner() public {
        address treasuryEoa = address(0xCAFE);
        vm.prank(owner);
        market.setTreasury(treasuryEoa);

        vm.startPrank(owner);
        market.setMockOraclePrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-fee", 0);

        vm.warp(block.timestamp + 2 hours);

        address[] memory bettors = new address[](1);
        bettors[0] = bettor1;
        string[] memory vaultIds = new string[](1);
        vaultIds[0] = "vault-fee";
        uint8[] memory choices = new uint8[](1);
        choices[0] = 1;
        vm.prank(owner);
        market.revealChoices(0, bettors, vaultIds, choices);

        uint256 ownerBefore = owner.balance;
        uint256 treasuryBefore = treasuryEoa.balance;

        vm.startPrank(owner);
        market.setMockOraclePrice(1100 * 10**8);
        market.resolveMarket(0);
        vm.stopPrank();

        // 2% of 1 ether goes to treasury, NOT owner.
        assertEq(treasuryEoa.balance - treasuryBefore, 0.02 ether);
        assertEq(owner.balance, ownerBefore);
    }

    function testSetKeeperRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert("Keeper required");
        market.setKeeper(address(0));
    }

    function testSetTreasuryRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert("Treasury required");
        market.setTreasury(address(0));
    }

    function testNonOwnerCannotRotateRoles() public {
        vm.prank(bettor1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.setKeeper(address(0xBEEF));

        vm.prank(bettor1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.setTreasury(address(0xCAFE));
    }

    // ─── Tests: V3 pause + oracle staleness ─────────────────────────────

    function testPauseBlocksPlaceBet() public {
        testStartNextMarketBumpsRoundId();

        vm.prank(owner);
        market.pause();

        vm.prank(bettor1);
        vm.expectRevert(); // Pausable: paused
        market.placeBet{value: 1 ether}("vault-paused", 0);

        vm.prank(owner);
        market.unpause();

        vm.prank(bettor1);
        market.placeBet{value: 1 ether}("vault-ok", 0);
        assertEq(market.getBettorCount(0), 1);
    }

    function testPauseDoesNotBlockLifecycle() public {
        // Bets placed, then paused — reveal/resolve/distribute must still work.
        testRevealChoices();

        vm.prank(owner);
        market.pause();

        vm.startPrank(owner);
        market.setMockOraclePrice(1100 * 10**8);
        market.resolveMarket(0); // must not revert while paused
        market.distributeWinnings(0, 10);
        vm.stopPrank();

        assertTrue(market.isFullyDistributed(0));
    }

    function testOnlyOwnerCanPause() public {
        vm.prank(bettor1);
        vm.expectRevert("Ownable: caller is not the owner");
        market.pause();
    }

    function testSetMaxOracleDelay() public {
        vm.prank(owner);
        market.setMaxOracleDelay(180);
        assertEq(market.maxOracleDelaySeconds(), 180);
    }

    function testMigrateV3RevertsOnSecondCall() public {
        vm.prank(owner);
        vm.expectRevert();
        market.migrateV3(180);
    }
}
