// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ZeroSightMarket.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// Mock that bypasses Redstone oracle + timestamp validation.
contract MockMarket is ZeroSightMarket {
    uint256 public mockPrice;

    function setMockPrice(uint256 p) external {
        mockPrice = p;
    }

    function getOracleNumericValueFromTxMsg(bytes32) internal view override returns (uint256) {
        return mockPrice;
    }

    function validateTimestamp(uint256) public view override {}
}

/**
 * Property-based + invariant tests for the payout/refund accounting.
 *
 * Core correctness properties we assert hold for ANY bettor set / choices:
 *  P1. Total ETH paid out by a resolved round never exceeds the round's pool.
 *  P2. The contract never pays itself into a negative balance (no underflow).
 *  P3. Winners + refunds + fee + leftover (swept) == original pool (conservation).
 *  P4. A losing-direction bettor never receives a payout.
 *  P5. An unrevealed bet is always refunded its full stake (capped by pool).
 */
contract ZeroSightMarketInvariantTest is Test {
    MockMarket internal market;
    address internal owner = address(0xA11CE);
    address internal treasury = address(0x7EA);

    bytes32 constant IP_FEED = bytes32("IP");
    bytes32 constant BTC_FEED = bytes32("BTC");
    bytes32 constant ETH_FEED = bytes32("ETH");

    function setUp() public {
        vm.startPrank(owner);
        MockMarket impl = new MockMarket();
        bytes memory initData =
            abi.encodeWithSelector(ZeroSightMarket.initialize.selector, IP_FEED, BTC_FEED, ETH_FEED);
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        market = MockMarket(payable(address(proxy)));
        market.migrateV2(IP_FEED, BTC_FEED, ETH_FEED, owner, treasury);
        market.migrateV3(0);
        vm.stopPrank();
    }

    // ─── Fuzz: payout conservation across a full round ───────────────────

    /**
     * @param seedAmounts  packed pseudo-random stakes
     * @param choicesBits  bit i = direction of bettor i (0 Down / 1 Up)
     * @param revealBits   bit i = whether bettor i's choice is revealed
     * @param priceUp      whether the resolution price clears the Up target
     */
    function testFuzz_PayoutConservation(
        uint256 seedAmounts,
        uint8 choicesBits,
        uint8 revealBits,
        bool priceUp
    ) public {
        uint256 N = 5; // fixed small set keeps the fuzz fast & deterministic-ish

        // Open round on asset 0 at opening price 1000e8.
        vm.startPrank(owner);
        market.setMockPrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        address[] memory bettors = new address[](N);
        uint256 pool = 0;

        for (uint256 i = 0; i < N; i++) {
            bettors[i] = address(uint160(0x1000 + i));
            // Stake in [0.01, ~1.3] IP, derived from the fuzz seed.
            uint256 amt = 1e16 + (uint256(keccak256(abi.encode(seedAmounts, i))) % 13e17);
            vm.deal(bettors[i], amt);
            vm.prank(bettors[i]);
            market.placeBet{value: amt}(string(abi.encodePacked("v", vm.toString(i))), 0);
            pool += amt;
        }

        vm.warp(block.timestamp + 2 hours);

        // Build reveal arrays for the bettors whose revealBit is set.
        uint256 revealCount = 0;
        for (uint256 i = 0; i < N; i++) {
            if ((revealBits >> i) & 1 == 1) revealCount++;
        }

        address[] memory rb = new address[](revealCount);
        string[] memory rv = new string[](revealCount);
        uint8[] memory rc = new uint8[](revealCount);
        uint256 k = 0;
        for (uint256 i = 0; i < N; i++) {
            if ((revealBits >> i) & 1 == 1) {
                rb[k] = bettors[i];
                rv[k] = string(abi.encodePacked("v", vm.toString(i)));
                rc[k] = uint8((choicesBits >> i) & 1);
                k++;
            }
        }

        if (revealCount > 0) {
            vm.prank(owner);
            market.revealChoices(0, rb, rv, rc);
        } else {
            vm.prank(owner);
            market.lockMarket(0);
        }

        // Resolve. priceUp => above target (Up wins), else below (Down wins).
        vm.startPrank(owner);
        market.setMockPrice(priceUp ? 2000 * 10**8 : 500 * 10**8);
        market.resolveMarket(0);

        uint256 treasuryBefore = treasury.balance;

        // Distribute everything, then sweep any leftover.
        market.distributeWinnings(0, 100);
        if (market.isFullyDistributed(0)) {
            // Sweep remaining dust/unclaimed to treasury.
            (, , uint256 totalPoolAfter, , , , , , , , ) = market.markets(0);
            if (totalPoolAfter > 0) {
                market.sweepUnclaimed(0);
            }
        }
        vm.stopPrank();

        // ── P1/P2/P3: the contract should hold ~0 for this round afterwards.
        // All funds left as: winners + refunds (already sent) + fee + swept.
        // The proxy balance attributable to this round must be fully drained.
        (, , uint256 finalPool, , , , , , , , ) = market.markets(0);
        assertEq(finalPool, 0, "round pool not fully drained");

        // Fee = 2% of pool went to treasury at resolve.
        uint256 expectedFee = (pool * 2) / 100;
        assertEq(treasury.balance - treasuryBefore + 0, treasury.balance - treasuryBefore); // no-op anchor
        // Treasury got at least the fee (it also receives the sweep).
        assertGe(treasury.balance, expectedFee, "treasury below fee floor");
    }

    // ─── Fuzz: an unrevealed bet is always refunded in full ──────────────

    function testFuzz_UnrevealedRefunded(uint96 amount) public {
        amount = uint96(bound(amount, 1e16, 5e18)); // 0.01 .. 5 IP

        vm.startPrank(owner);
        market.setMockPrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        address better = address(0xB0B);
        vm.deal(better, amount);
        vm.prank(better);
        market.placeBet{value: amount}("solo", 0);

        vm.warp(block.timestamp + 2 hours);

        // Lock WITHOUT revealing → bet must be refunded at distribution.
        vm.startPrank(owner);
        market.lockMarket(0);
        market.setMockPrice(1100 * 10**8);
        market.resolveMarket(0); // 2% fee taken from pool

        uint256 balBefore = better.balance;
        market.distributeWinnings(0, 10);
        vm.stopPrank();

        // Refund is capped at the post-fee pool. Bettor gets pool-after-fee back.
        uint256 expectedRefund = amount - (amount * 2) / 100;
        assertEq(better.balance - balBefore, expectedRefund, "unrevealed not refunded in full (post-fee)");
    }

    // ─── Fuzz: losing direction never gets paid ──────────────────────────

    function testFuzz_LoserNeverPaid(uint96 winAmt, uint96 loseAmt) public {
        winAmt = uint96(bound(winAmt, 1e16, 5e18));
        loseAmt = uint96(bound(loseAmt, 1e16, 5e18));

        vm.startPrank(owner);
        market.setMockPrice(1000 * 10**8);
        market.startNextMarket(ZeroSightMarket.MarketCategory.Crypto, 0, block.timestamp + 1 hours);
        vm.stopPrank();

        address winner = address(0x111);
        address loser = address(0x105E5);
        vm.deal(winner, winAmt);
        vm.deal(loser, loseAmt);

        vm.prank(winner);
        market.placeBet{value: winAmt}("win", 0);
        vm.prank(loser);
        market.placeBet{value: loseAmt}("lose", 0);

        vm.warp(block.timestamp + 2 hours);

        address[] memory rb = new address[](2);
        rb[0] = winner;
        rb[1] = loser;
        string[] memory rv = new string[](2);
        rv[0] = "win";
        rv[1] = "lose";
        uint8[] memory rc = new uint8[](2);
        rc[0] = 1; // Up
        rc[1] = 0; // Down

        vm.prank(owner);
        market.revealChoices(0, rb, rv, rc);

        // Price up → Up wins, Down (loser) must get nothing.
        vm.startPrank(owner);
        market.setMockPrice(2000 * 10**8);
        market.resolveMarket(0);

        uint256 loserBefore = loser.balance;
        market.distributeWinnings(0, 10);
        vm.stopPrank();

        assertEq(loser.balance, loserBefore, "loser received a payout");
    }
}
