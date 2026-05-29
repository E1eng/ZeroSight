// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {RedstoneConsumerNumericBase} from "@redstone-finance/evm-connector/contracts/core/RedstoneConsumerNumericBase.sol";

/**
 * @title ZeroSightMarket
 * @notice Blind parimutuel prediction market secured by Story Protocol CDR.
 *         Users bet on Up/Down outcomes with encrypted choices.
 *         Winnings are auto-distributed by the owner after resolution — no claims needed.
 * @dev UUPS-upgradeable. Deploy behind an ERC1967Proxy.
 */
contract ZeroSightMarket is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    RedstoneConsumerNumericBase
{
    using Address for address payable;

    // ──────────────────────────── Enums ────────────────────────────

    enum MarketStatus {
        Open,
        Locked,
        Resolved
    }

    /// @notice Future-proof category for expanding into Sports / Politics markets.
    enum MarketCategory {
        Crypto,
        Sports,
        Politics
    }

    enum MarketDirection {
        Down,
        Up
    }

    // ──────────────────────────── Structs ──────────────────────────

    struct FeedConfig {
        bytes32 dataFeedId;
    }

    struct BetInfo {
        uint256 amount;
        uint8 assetIndex;
        string vaultId;
        uint8 direction; // Set later during reveal phase
        bool choiceRevealed; // True once owner decrypts and submits
        bool distributed;
        uint256 placedAt;
    }

    // ──────────────────────────── State ────────────────────────────

    /// @notice assetIndex => Redstone feed id  (0 = IP, 1 = BTC, 2 = ETH, …)
    mapping(uint8 => FeedConfig) private feedConfigs;

    mapping(address => BetInfo[]) private userBets;

    /// @notice Tracks every unique bettor for automatic distribution.
    address[] private bettors;
    mapping(address => bool) private hasBet;

    address[] private authorisedSigners;
    uint8 private uniqueSignersThreshold;

    uint256 public totalPool;
    MarketStatus public marketStatus;
    MarketCategory public activeCategory;
    uint8 public activeAsset;
    uint256 public deadline;
    uint256 public openingPrice;
    uint256 public resolvedPrice;
    uint256 public winningChoice; // 0 = Down, 1 = Up

    uint256[2] public totalStakeByChoice;
    uint256 public payoutPool;
    uint256 public winningStakeTotal;

    /// @notice Cursor into `bettors` array — tracks auto-distribution progress.
    uint256 public distributionIndex;

    // ──────────────────────────── Events ───────────────────────────

    event BetPlaced(address indexed bettor, string vaultId, uint8 assetIndex, uint256 amount);
    event ChoicesRevealed(uint256 count);
    event MarketLocked(uint256 timestamp);
    event MarketResolved(uint8 indexed assetIndex, uint256 resolvedPrice, uint256 winningChoice);
    event WinningsDistributed(address indexed bettor, uint256 amount);
    event FeedConfigUpdated(uint8 indexed assetIndex, bytes32 dataFeedId);
    event OracleConfigUpdated(uint8 uniqueSignersThreshold, address[] signers);

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyWhileOpen() {
        require(marketStatus == MarketStatus.Open, "Market not open");
        _;
    }

    modifier onlyResolved() {
        require(marketStatus == MarketStatus.Resolved, "Market not resolved");
        _;
    }

    // ──────────────────────────── Constructor (disabled) ───────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ──────────────────────────── Initializer ──────────────────────

    function initialize(
        bytes32 ipFeedId,
        bytes32 btcFeedId,
        bytes32 ethFeedId
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setFeedConfig(0, ipFeedId);  // asset 0 = IP/STORY
        _setFeedConfig(1, btcFeedId); // asset 1 = BTC
        _setFeedConfig(2, ethFeedId); // asset 2 = ETH

        // Default Redstone authorised signers (production set).
        address[] memory defaultSigners = new address[](5);
        defaultSigners[0] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        defaultSigners[1] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;
        defaultSigners[2] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        defaultSigners[3] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        defaultSigners[4] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        _updateOracleConfig(defaultSigners, 3);

        marketStatus = MarketStatus.Resolved;
        activeCategory = MarketCategory.Crypto;
    }

    // ──────────────────────────── UUPS ─────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────────────── Core Logic ───────────────────────

    receive() external payable {
        revert("Direct payments disabled");
    }

    /**
     * @notice Place an encrypted bet on the active market.
     * @param vaultId CDR vault UUID that holds the encrypted choice.
     * @param assetIndex Must match `activeAsset`.
     */
    function placeBet(
        string memory vaultId,
        uint8 assetIndex
    ) external payable onlyWhileOpen {
        require(bytes(vaultId).length > 0, "Vault required");
        require(msg.value > 0, "Zero stake");
        require(assetIndex == activeAsset, "Inactive asset");
        require(block.timestamp < deadline, "Betting closed");

        totalPool += msg.value;

        if (!hasBet[msg.sender]) {
            hasBet[msg.sender] = true;
            bettors.push(msg.sender);
        }

        userBets[msg.sender].push(
            BetInfo({
                amount: msg.value,
                assetIndex: assetIndex,
                vaultId: vaultId,
                direction: 0,
                choiceRevealed: false,
                distributed: false,
                placedAt: block.timestamp
            })
        );

        emit BetPlaced(msg.sender, vaultId, assetIndex, msg.value);
    }

    /**
     * @notice Reveal the decrypted choices for bettors.
     * @dev Called by the owner off-chain after decrypting the CDR vaults.
     *      Must be called before resolveMarket.
     */
    function revealChoices(address[] calldata bettorAddresses, string[] calldata vaultIds, uint8[] calldata choices) external onlyOwner {
        require(marketStatus == MarketStatus.Locked || marketStatus == MarketStatus.Open, "Resolution blocked");
        require(block.timestamp >= deadline, "Deadline not reached");
        require(bettorAddresses.length == choices.length && bettorAddresses.length == vaultIds.length, "Length mismatch");

        if (marketStatus == MarketStatus.Open) {
            marketStatus = MarketStatus.Locked;
            emit MarketLocked(block.timestamp);
        }

        uint256 revealedCount = 0;
        for (uint256 i = 0; i < bettorAddresses.length; i++) {
            address bettor = bettorAddresses[i];
            string calldata vaultId = vaultIds[i];
            uint8 choice = choices[i];
            require(choice <= 1, "Invalid choice");

            BetInfo[] storage bets = userBets[bettor];
            for (uint256 j = 0; j < bets.length; j++) {
                BetInfo storage bet = bets[j];
                // In a real production scenario with multiple rounds, we'd ensure
                // we are only revealing the active round's bets. Here we reveal unrevealed ones.
                if (!bet.choiceRevealed && bet.assetIndex == activeAsset && keccak256(bytes(bet.vaultId)) == keccak256(bytes(vaultId))) {
                    bet.direction = choice;
                    bet.choiceRevealed = true;
                    totalStakeByChoice[choice] += bet.amount;
                    revealedCount++;
                    break;
                }
            }
        }

        emit ChoicesRevealed(revealedCount);
    }

    /**
     * @notice Lock the market once the deadline passes. Optional — resolveMarket auto-locks.
     */
    function lockMarket() external onlyOwner onlyWhileOpen {
        require(block.timestamp >= deadline, "Deadline not reached");
        marketStatus = MarketStatus.Locked;
        emit MarketLocked(block.timestamp);
    }

    /**
     * @notice Resolve the market by fetching the closing price from Redstone.
     * @dev Must be called with a Redstone-wrapped transaction (WrapperBuilder).
     */
    function resolveMarket() external onlyOwner {
        require(marketStatus != MarketStatus.Resolved, "Already resolved");
        require(block.timestamp > deadline, "Resolution blocked");
        require(openingPrice > 0, "Opening price missing");

        if (marketStatus == MarketStatus.Open) {
            marketStatus = MarketStatus.Locked;
            emit MarketLocked(block.timestamp);
        }

        bytes32 feedId = feedConfigs[activeAsset].dataFeedId;
        require(feedId != bytes32(0), "Feed not configured");

        uint256 price = getOracleNumericValueFromTxMsg(feedId);
        require(price > 0, "Invalid oracle price");

        resolvedPrice = price;
        winningChoice = price >= openingPrice ? 1 : 0;
        payoutPool = totalPool;
        winningStakeTotal = totalStakeByChoice[winningChoice];
        distributionIndex = 0;
        marketStatus = MarketStatus.Resolved;

        emit MarketResolved(activeAsset, price, winningChoice);
    }

    // ──────────────────────────── Auto-Distribution ────────────────

    /**
     * @notice Automatically distribute winnings to bettors in batches.
     * @dev Called by the owner after resolution. Gas-safe — processes `batchSize` bettors per call.
     *      If there are no winners (all bets on losing side), call `sweepUnclaimed` instead.
     * @param batchSize Number of bettors to process in this call.
     */
    function distributeWinnings(uint256 batchSize) external onlyOwner nonReentrant onlyResolved {
        require(distributionIndex < bettors.length, "Distribution complete");

        uint256 end = distributionIndex + batchSize;
        if (end > bettors.length) end = bettors.length;

        if (winningStakeTotal == 0) {
            // Edge case: no one picked the winning side — skip distribution, owner can sweep.
            distributionIndex = end;
            return;
        }

        for (uint256 i = distributionIndex; i < end; i++) {
            address bettor = bettors[i];
            BetInfo[] storage bets = userBets[bettor];

            for (uint256 j = 0; j < bets.length; j++) {
                BetInfo storage bet = bets[j];
                if (bet.distributed) continue;

                bet.distributed = true;

                if (!bet.choiceRevealed || bet.direction != winningChoice) continue;

                uint256 payout = (bet.amount * payoutPool) / winningStakeTotal;
                if (payout > totalPool) payout = totalPool;
                totalPool -= payout;

                payable(bettor).sendValue(payout);
                emit WinningsDistributed(bettor, payout);
            }
        }

        distributionIndex = end;
    }

    /**
     * @notice Returns true when all bettors have been processed.
     */
    function isFullyDistributed() external view returns (bool) {
        return distributionIndex >= bettors.length;
    }

    /**
     * @notice Sweep any remaining dust to the owner (rounding leftovers, no-winner markets).
     */
    function sweepUnclaimed() external onlyOwner onlyResolved {
        require(distributionIndex >= bettors.length, "Distribution pending");
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            payable(owner()).sendValue(remaining);
        }
        totalPool = 0;
    }

    // ──────────────────────────── Market Lifecycle ─────────────────

    /**
     * @notice Start a new market round.
     * @dev Requires the previous round to be fully resolved and distributed.
     *      Must be a Redstone-wrapped transaction to fetch the opening price.
     * @param category   Market category (Crypto for now, Sports/Politics later).
     * @param assetIndex Which asset feed to use (0=IP, 1=BTC, 2=ETH).
     * @param newDeadline Unix timestamp when betting closes.
     */
    function startNextMarket(
        MarketCategory category,
        uint8 assetIndex,
        uint256 newDeadline
    ) external onlyOwner {
        require(marketStatus == MarketStatus.Resolved, "Market not settled");
        require(distributionIndex >= bettors.length, "Distribution pending");
        require(newDeadline > block.timestamp, "Invalid deadline");

        bytes32 feedId = feedConfigs[assetIndex].dataFeedId;
        require(feedId != bytes32(0), "Feed not configured");

        // Reset bettor state from previous round.
        for (uint256 i = 0; i < bettors.length; i++) {
            delete userBets[bettors[i]];
            delete hasBet[bettors[i]];
        }
        delete bettors;

        uint256[2] memory empty;
        totalStakeByChoice = empty;
        totalPool = 0;
        payoutPool = 0;
        winningStakeTotal = 0;
        resolvedPrice = 0;
        winningChoice = 0;
        distributionIndex = 0;

        openingPrice = getOracleNumericValueFromTxMsg(feedId);
        require(openingPrice > 0, "Invalid opening price");

        activeCategory = category;
        activeAsset = assetIndex;
        deadline = newDeadline;
        marketStatus = MarketStatus.Open;
    }

    // ──────────────────────────── View Helpers ─────────────────────

    function getUserBets(address bettor) external view returns (BetInfo[] memory) {
        return userBets[bettor];
    }

    function getFeedConfig(uint8 assetIndex) external view returns (FeedConfig memory) {
        return feedConfigs[assetIndex];
    }

    function getBettorCount() external view returns (uint256) {
        return bettors.length;
    }

    function getOracleSigners() external view returns (address[] memory) {
        return authorisedSigners;
    }

    // ──────────────────────────── Admin ────────────────────────────

    function updateFeedConfig(uint8 assetIndex, bytes32 dataFeedId) external onlyOwner {
        _setFeedConfig(assetIndex, dataFeedId);
    }

    function updateOracleConfig(address[] calldata signers, uint8 threshold) external onlyOwner {
        _updateOracleConfig(signers, threshold);
    }

    // ──────────────────────────── Redstone Overrides ───────────────

    function getDataServiceId() public pure override returns (string memory) {
        return "redstone-primary-prod";
    }

    function getAuthorisedSignerIndex(address receivedSigner) public view override returns (uint8) {
        for (uint8 i = 0; i < authorisedSigners.length; i++) {
            if (authorisedSigners[i] == receivedSigner) {
                return i;
            }
        }
        revert("Signer not authorized");
    }

    function getUniqueSignersThreshold() public view override returns (uint8) {
        return uniqueSignersThreshold;
    }

    // ──────────────────────────── Internal ─────────────────────────

    function _setFeedConfig(uint8 assetIndex, bytes32 dataFeedId) internal {
        require(dataFeedId != bytes32(0), "Invalid feed id");
        feedConfigs[assetIndex] = FeedConfig({dataFeedId: dataFeedId});
        emit FeedConfigUpdated(assetIndex, dataFeedId);
    }

    function _updateOracleConfig(address[] memory signers, uint8 threshold) internal {
        require(signers.length > 0, "Signers required");
        require(threshold > 0 && threshold <= signers.length, "Invalid threshold");

        authorisedSigners = signers;
        uniqueSignersThreshold = threshold;

        emit OracleConfigUpdated(threshold, signers);
    }
}
