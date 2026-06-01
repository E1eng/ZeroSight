// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {RedstoneConsumerNumericBase} from "@redstone-finance/evm-connector/contracts/core/RedstoneConsumerNumericBase.sol";

/**
 * @title ZeroSightMarket V2
 * @notice Blind parimutuel prediction market secured by Story Protocol CDR.
 *
 * V2 changes (UUPS upgrade — storage append-only, struct layouts unchanged):
 *  - Per-asset roundId counter (currentRoundId).
 *  - vaultId emitted in WinningsDistributed / WinningsDistributionFailed / BetRefunded
 *    so off-chain indexers can match BetPlaced ↔ outcome 1:1.
 *  - roundId emitted in BetPlaced / MarketOpened / ChoicesRevealed / MarketLocked /
 *    MarketResolved / WinningsDistributed / BetRefunded.
 *  - New event MarketOpened — required for round-aware indexing.
 *  - Per-asset configurable targetBps (was hardcoded per assetIndex).
 *  - MarketCategory enum extended (Esports, Economics, Entertainment, Other).
 *  - Daily-market feeds (asset 3-5) and targetBps seeded via migrateV2.
 *  - setFeedConfig now goes through validated _setFeedConfig.
 *  - Storage gap reserved for future upgrades.
 */
contract ZeroSightMarket is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    RedstoneConsumerNumericBase
{
    using Address for address payable;

    // ──────────────────────────── Constants ────────────────────────

    uint256 public constant MIN_BET = 1e16; // 0.01 IP
    uint256 public constant PROTOCOL_FEE_PERCENT = 2; // 2%
    uint8 public constant ASSET_COUNT = 6; // 0..2 hourly, 3..5 daily

    // ──────────────────────────── Enums ────────────────────────────

    enum MarketStatus {
        Open,
        Locked,
        Resolved
    }

    /// @dev Append-only. Existing values must keep their ordinal positions.
    enum MarketCategory {
        Crypto,        // 0
        Sports,        // 1
        Politics,      // 2
        Esports,       // 3
        Economics,     // 4
        Entertainment, // 5
        Other          // 6
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
        uint256 shares;
        uint8 assetIndex;
        string vaultId;
        uint8 direction;
        bool choiceRevealed;
        bool distributed;
        uint256 placedAt;
    }

    struct MarketState {
        MarketStatus status;
        MarketCategory category;
        uint256 totalPool;
        uint256 openedAt;
        uint256 deadline;
        uint256 openingPrice;
        uint256 resolvedPrice;
        uint256 winningChoice;
        uint256[2] totalSharesByChoice;
        uint256 payoutPool;
        uint256 winningSharesTotal;
        uint256 distributionIndex;
        address[] bettors;
    }

    // ──────────────────────────── V1 Storage (do NOT reorder) ──────

    mapping(uint8 => FeedConfig) private feedConfigs;
    mapping(uint8 => MarketState) public markets;
    mapping(uint8 => mapping(address => BetInfo[])) private userBets;
    mapping(uint8 => mapping(address => bool)) private hasBet;

    address[] private authorisedSigners;
    uint8 private uniqueSignersThreshold;

    // ──────────────────────────── V2 Storage (append-only) ─────────

    /// @notice Per-asset round counter; bumped on every startNextMarket.
    mapping(uint8 => uint256) public currentRoundId;

    /// @notice Per-asset target threshold in basis points (e.g. 75 = +0.75%).
    mapping(uint8 => uint16) public targetBps;

    /// @notice Hot wallet allowed to drive market lifecycle (start/reveal/resolve/distribute).
    ///         Owner can rotate this without an upgrade. Owner retains all powers.
    address public keeper;

    /// @notice Recipient of the 2% protocol fee. Defaults to owner if unset.
    address public treasury;

    /// @dev Reserved storage gap for future upgrades (50 - 4 used = 46).
    uint256[46] private __gap;

    // ──────────────────────────── Events ───────────────────────────

    event BetPlaced(
        address indexed bettor,
        string vaultId,
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        uint256 amount
    );

    event MarketOpened(
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        MarketCategory category,
        uint256 openedAt,
        uint256 deadline,
        uint256 openingPrice,
        uint16 targetBps
    );

    event ChoicesRevealed(uint8 indexed assetIndex, uint256 indexed roundId, uint256 count);

    event MarketLocked(uint8 indexed assetIndex, uint256 indexed roundId, uint256 timestamp);

    event MarketResolved(
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        uint256 resolvedPrice,
        uint256 targetPrice,
        uint256 winningChoice,
        uint256 feeTaken
    );

    event WinningsDistributed(
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        address indexed bettor,
        string vaultId,
        uint256 amount
    );

    event WinningsDistributionFailed(
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        address indexed bettor,
        string vaultId,
        uint256 amount
    );

    event BetRefunded(
        uint8 indexed assetIndex,
        uint256 indexed roundId,
        address indexed bettor,
        string vaultId,
        uint256 amount
    );

    event FeedConfigUpdated(uint8 indexed assetIndex, bytes32 dataFeedId);
    event TargetBpsUpdated(uint8 indexed assetIndex, uint16 oldBps, uint16 newBps);
    event OracleConfigUpdated(uint8 uniqueSignersThreshold, address[] signers);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyWhileOpen(uint8 assetIndex) {
        require(markets[assetIndex].status == MarketStatus.Open, "Market not open");
        _;
    }

    modifier onlyResolved(uint8 assetIndex) {
        require(markets[assetIndex].status == MarketStatus.Resolved, "Market not resolved");
        _;
    }

    modifier validAsset(uint8 assetIndex) {
        require(assetIndex < ASSET_COUNT, "Invalid asset");
        _;
    }

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper or owner");
        _;
    }

    // ──────────────────────────── Constructor (disabled) ───────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ──────────────────────────── Initializer (V1) ─────────────────

    function initialize(
        bytes32 ipFeedId,
        bytes32 btcFeedId,
        bytes32 ethFeedId
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _setFeedConfig(0, ipFeedId);
        _setFeedConfig(1, btcFeedId);
        _setFeedConfig(2, ethFeedId);

        address[] memory defaultSigners = new address[](5);
        defaultSigners[0] = 0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774;
        defaultSigners[1] = 0xdEB22f54738d54976C4c0fe5ce6d408E40d88499;
        defaultSigners[2] = 0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202;
        defaultSigners[3] = 0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE;
        defaultSigners[4] = 0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de;
        _updateOracleConfig(defaultSigners, 3);

        markets[0].status = MarketStatus.Resolved;
        markets[1].status = MarketStatus.Resolved;
        markets[2].status = MarketStatus.Resolved;
    }

    // ──────────────────────────── V2 Migration ─────────────────────

    /**
     * @notice One-time migration after upgrading proxy from V1 to V2.
     *         Configures daily-market feeds (assets 3-5), seeds targetBps for
     *         all 6 assets, and sets the keeper + treasury roles.
     *         Safe to call only once thanks to reinitializer(2).
     *
     * @param ipFeedId      Redstone feed for IP / Story.
     * @param btcFeedId     Redstone feed for BTC.
     * @param ethFeedId     Redstone feed for ETH.
     * @param keeperAddr    Hot wallet that drives lifecycle ops. Required (non-zero).
     * @param treasuryAddr  Recipient of the 2% protocol fee. Pass address(0) to
     *                      default to the current owner.
     */
    function migrateV2(
        bytes32 ipFeedId,
        bytes32 btcFeedId,
        bytes32 ethFeedId,
        address keeperAddr,
        address treasuryAddr
    ) external reinitializer(2) onlyOwner {
        // Daily feeds.
        _setFeedConfig(3, ipFeedId);
        _setFeedConfig(4, btcFeedId);
        _setFeedConfig(5, ethFeedId);

        // Seed daily-market state so keeper can start round 1.
        markets[3].status = MarketStatus.Resolved;
        markets[4].status = MarketStatus.Resolved;
        markets[5].status = MarketStatus.Resolved;

        // Seed targetBps to legacy values (basis points).
        _setTargetBps(0, 75);    // IP hourly +0.75%
        _setTargetBps(1, 25);    // BTC hourly +0.25%
        _setTargetBps(2, 40);    // ETH hourly +0.40%
        _setTargetBps(3, 400);   // IP daily +4.00%
        _setTargetBps(4, 150);   // BTC daily +1.50%
        _setTargetBps(5, 250);   // ETH daily +2.50%

        // Role split: keeper drives lifecycle, treasury collects fees.
        _setKeeper(keeperAddr);
        _setTreasury(treasuryAddr == address(0) ? owner() : treasuryAddr);
    }

    // ──────────────────────────── UUPS ─────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────────────── Core Logic ───────────────────────

    receive() external payable {
        revert("Direct payments disabled");
    }

    function placeBet(
        string memory vaultId,
        uint8 assetIndex
    ) external payable validAsset(assetIndex) onlyWhileOpen(assetIndex) {
        require(bytes(vaultId).length > 0, "Vault required");
        require(bytes(vaultId).length <= 78, "Vault too long"); // uint256 max ASCII length
        require(msg.value >= MIN_BET, "Min bet 0.01 IP");

        MarketState storage m = markets[assetIndex];
        require(block.timestamp < m.deadline, "Betting closed");

        m.totalPool += msg.value;

        if (!hasBet[assetIndex][msg.sender]) {
            hasBet[assetIndex][msg.sender] = true;
            m.bettors.push(msg.sender);
        }

        userBets[assetIndex][msg.sender].push(
            BetInfo({
                amount: msg.value,
                shares: 0,
                assetIndex: assetIndex,
                vaultId: vaultId,
                direction: 0,
                choiceRevealed: false,
                distributed: false,
                placedAt: block.timestamp
            })
        );

        emit BetPlaced(msg.sender, vaultId, assetIndex, currentRoundId[assetIndex], msg.value);
    }

    function revealChoices(
        uint8 assetIndex,
        address[] calldata bettorAddresses,
        string[] calldata vaultIds,
        uint8[] calldata choices
    ) external onlyKeeperOrOwner validAsset(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(m.status == MarketStatus.Locked || m.status == MarketStatus.Open, "Resolution blocked");
        require(block.timestamp >= m.deadline, "Deadline not reached");
        require(
            bettorAddresses.length == choices.length && bettorAddresses.length == vaultIds.length,
            "Length mismatch"
        );

        uint256 roundId = currentRoundId[assetIndex];

        if (m.status == MarketStatus.Open) {
            m.status = MarketStatus.Locked;
            emit MarketLocked(assetIndex, roundId, block.timestamp);
        }

        uint256 duration = m.deadline > m.openedAt ? m.deadline - m.openedAt : 1;
        uint256 revealedCount = 0;

        for (uint256 i = 0; i < bettorAddresses.length; i++) {
            address bettor = bettorAddresses[i];
            string calldata vaultId = vaultIds[i];
            uint8 choice = choices[i];
            require(choice <= 1, "Invalid choice");

            BetInfo[] storage bets = userBets[assetIndex][bettor];
            for (uint256 j = 0; j < bets.length; j++) {
                BetInfo storage bet = bets[j];

                if (
                    !bet.choiceRevealed &&
                    bet.assetIndex == assetIndex &&
                    keccak256(bytes(bet.vaultId)) == keccak256(bytes(vaultId))
                ) {
                    bet.direction = choice;
                    bet.choiceRevealed = true;

                    // Time-weighted shares: 1x..2x linear decay.
                    uint256 timeLeft = m.deadline > bet.placedAt ? m.deadline - bet.placedAt : 0;
                    uint256 multiplier = 1000 + ((1000 * timeLeft) / duration);
                    bet.shares = (bet.amount * multiplier) / 1000;

                    m.totalSharesByChoice[choice] += bet.shares;
                    revealedCount++;
                    break;
                }
            }
        }

        emit ChoicesRevealed(assetIndex, roundId, revealedCount);
    }

    function lockMarket(uint8 assetIndex) external onlyKeeperOrOwner validAsset(assetIndex) onlyWhileOpen(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(block.timestamp >= m.deadline, "Deadline not reached");
        m.status = MarketStatus.Locked;
        emit MarketLocked(assetIndex, currentRoundId[assetIndex], block.timestamp);
    }

    function resolveMarket(uint8 assetIndex) external onlyKeeperOrOwner validAsset(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(m.status != MarketStatus.Resolved, "Already resolved");
        require(block.timestamp > m.deadline, "Resolution blocked");
        require(m.openingPrice > 0, "Opening price missing");

        uint256 roundId = currentRoundId[assetIndex];

        if (m.status == MarketStatus.Open) {
            m.status = MarketStatus.Locked;
            emit MarketLocked(assetIndex, roundId, block.timestamp);
        }

        bytes32 feedId = feedConfigs[assetIndex].dataFeedId;
        require(feedId != bytes32(0), "Feed not configured");

        uint256 price = getOracleNumericValueFromTxMsg(feedId);
        require(price > 0, "Invalid oracle price");

        m.resolvedPrice = price;

        uint16 bps = _effectiveTargetBps(assetIndex);
        uint256 targetPrice = (m.openingPrice * (10000 + bps)) / 10000;

        m.winningChoice = price >= targetPrice ? 1 : 0;

        // Protocol fee: 2% of total pool.
        uint256 fee = (m.totalPool * PROTOCOL_FEE_PERCENT) / 100;
        m.payoutPool = m.totalPool - fee;
        m.winningSharesTotal = m.totalSharesByChoice[m.winningChoice];
        m.distributionIndex = 0;
        m.status = MarketStatus.Resolved;

        if (fee > 0) {
            m.totalPool -= fee;
            address recipient = treasury == address(0) ? owner() : treasury;
            (bool success, ) = recipient.call{value: fee}("");
            require(success, "Fee transfer failed");
        }

        emit MarketResolved(assetIndex, roundId, price, targetPrice, m.winningChoice, fee);
    }

    function distributeWinnings(uint8 assetIndex, uint256 batchSize)
        external
        onlyKeeperOrOwner
        nonReentrant
        validAsset(assetIndex)
        onlyResolved(assetIndex)
    {
        MarketState storage m = markets[assetIndex];
        require(m.distributionIndex < m.bettors.length, "Distribution complete");
        uint256 roundId = currentRoundId[assetIndex];

        uint256 end = m.distributionIndex + batchSize;
        if (end > m.bettors.length) end = m.bettors.length;

        for (uint256 i = m.distributionIndex; i < end; i++) {
            address bettor = m.bettors[i];
            BetInfo[] storage bets = userBets[assetIndex][bettor];

            for (uint256 j = 0; j < bets.length; j++) {
                BetInfo storage bet = bets[j];
                if (bet.distributed) continue;

                bet.distributed = true;

                // Refund: bet failed CDR decryption.
                if (!bet.choiceRevealed) {
                    uint256 refundAmount = bet.amount;
                    if (refundAmount > m.totalPool) refundAmount = m.totalPool;
                    if (refundAmount > 0) {
                        (bool refundOk, ) = bettor.call{value: refundAmount}("");
                        if (refundOk) {
                            m.totalPool -= refundAmount;
                            emit BetRefunded(assetIndex, roundId, bettor, bet.vaultId, refundAmount);
                        }
                    }
                    continue;
                }

                if (bet.direction != m.winningChoice) continue;

                if (m.winningSharesTotal > 0) {
                    uint256 payout = (bet.shares * m.payoutPool) / m.winningSharesTotal;
                    if (payout > m.totalPool) payout = m.totalPool;

                    (bool success, ) = bettor.call{value: payout}("");
                    if (success) {
                        m.totalPool -= payout;
                        emit WinningsDistributed(assetIndex, roundId, bettor, bet.vaultId, payout);
                    } else {
                        emit WinningsDistributionFailed(assetIndex, roundId, bettor, bet.vaultId, payout);
                    }
                }
            }
        }

        m.distributionIndex = end;
    }

    function isFullyDistributed(uint8 assetIndex) external view returns (bool) {
        return markets[assetIndex].distributionIndex >= markets[assetIndex].bettors.length;
    }

    function sweepUnclaimed(uint8 assetIndex)
        external
        onlyKeeperOrOwner
        validAsset(assetIndex)
        onlyResolved(assetIndex)
    {
        MarketState storage m = markets[assetIndex];
        require(m.distributionIndex >= m.bettors.length, "Distribution pending");
        uint256 remainingPool = m.totalPool;
        if (remainingPool > 0) {
            m.totalPool = 0;
            address recipient = treasury == address(0) ? owner() : treasury;
            (bool success, ) = recipient.call{value: remainingPool}("");
            require(success, "Sweep failed");
        }
    }

    function startNextMarket(
        MarketCategory category,
        uint8 assetIndex,
        uint256 newDeadline
    ) external onlyKeeperOrOwner validAsset(assetIndex) {
        MarketState storage m = markets[assetIndex];

        require(m.status == MarketStatus.Resolved || m.deadline == 0, "Market not settled");
        require(m.distributionIndex >= m.bettors.length, "Distribution pending");
        require(newDeadline > block.timestamp, "Invalid deadline");

        bytes32 feedId = feedConfigs[assetIndex].dataFeedId;
        require(feedId != bytes32(0), "Feed not configured");

        for (uint256 i = 0; i < m.bettors.length; i++) {
            delete userBets[assetIndex][m.bettors[i]];
            delete hasBet[assetIndex][m.bettors[i]];
        }
        delete m.bettors;

        uint256[2] memory empty;
        m.totalSharesByChoice = empty;
        m.totalPool = 0;
        m.payoutPool = 0;
        m.winningSharesTotal = 0;
        m.resolvedPrice = 0;
        m.winningChoice = 0;
        m.distributionIndex = 0;

        m.openingPrice = getOracleNumericValueFromTxMsg(feedId);
        require(m.openingPrice > 0, "Invalid opening price");

        m.category = category;
        m.openedAt = block.timestamp;
        m.deadline = newDeadline;
        m.status = MarketStatus.Open;

        uint256 newRoundId = currentRoundId[assetIndex] + 1;
        currentRoundId[assetIndex] = newRoundId;

        emit MarketOpened(
            assetIndex,
            newRoundId,
            category,
            block.timestamp,
            newDeadline,
            m.openingPrice,
            _effectiveTargetBps(assetIndex)
        );
    }

    // ──────────────────────────── View Helpers ─────────────────────

    function getUserBets(uint8 assetIndex, address bettor) external view returns (BetInfo[] memory) {
        return userBets[assetIndex][bettor];
    }

    function getSharesByChoice(uint8 assetIndex, uint256 choice) external view returns (uint256) {
        require(choice <= 1, "Invalid choice");
        return markets[assetIndex].totalSharesByChoice[choice];
    }

    function getFeedConfig(uint8 assetIndex) external view returns (FeedConfig memory) {
        return feedConfigs[assetIndex];
    }

    function getBettorCount(uint8 assetIndex) external view returns (uint256) {
        return markets[assetIndex].bettors.length;
    }

    function getBettors(uint8 assetIndex) external view returns (address[] memory) {
        return markets[assetIndex].bettors;
    }

    function getOracleSigners() external view returns (address[] memory) {
        return authorisedSigners;
    }

    function getEffectiveTargetBps(uint8 assetIndex) external view returns (uint16) {
        return _effectiveTargetBps(assetIndex);
    }

    // ──────────────────────────── Admin ────────────────────────────

    function setFeedConfig(uint8 assetIndex, bytes32 feedId) external onlyOwner {
        _setFeedConfig(assetIndex, feedId);
    }

    function updateFeedConfig(uint8 assetIndex, bytes32 dataFeedId) external onlyOwner {
        _setFeedConfig(assetIndex, dataFeedId);
    }

    function setTargetBps(uint8 assetIndex, uint16 newBps) external onlyOwner {
        _setTargetBps(assetIndex, newBps);
    }

    function updateOracleConfig(address[] calldata signers, uint8 threshold) external onlyOwner {
        _updateOracleConfig(signers, threshold);
    }

    /// @notice Rotate the keeper hot wallet without an upgrade. Owner only.
    function setKeeper(address newKeeper) external onlyOwner {
        _setKeeper(newKeeper);
    }

    /// @notice Update the treasury address that receives protocol fees. Owner only.
    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
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
        require(assetIndex < ASSET_COUNT, "Invalid asset");
        require(dataFeedId != bytes32(0), "Invalid feed id");
        feedConfigs[assetIndex] = FeedConfig({dataFeedId: dataFeedId});
        emit FeedConfigUpdated(assetIndex, dataFeedId);
    }

    function _setTargetBps(uint8 assetIndex, uint16 newBps) internal {
        require(assetIndex < ASSET_COUNT, "Invalid asset");
        require(newBps > 0 && newBps <= 5000, "BPS out of range"); // 0.01%..50%
        uint16 oldBps = targetBps[assetIndex];
        targetBps[assetIndex] = newBps;
        emit TargetBpsUpdated(assetIndex, oldBps, newBps);
    }

    function _setKeeper(address newKeeper) internal {
        require(newKeeper != address(0), "Keeper required");
        address old = keeper;
        keeper = newKeeper;
        emit KeeperUpdated(old, newKeeper);
    }

    function _setTreasury(address newTreasury) internal {
        require(newTreasury != address(0), "Treasury required");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    /// @dev Returns configured targetBps; falls back to legacy hardcoded values
    ///      so contracts upgraded but not yet migrated keep working.
    function _effectiveTargetBps(uint8 assetIndex) internal view returns (uint16) {
        uint16 bps = targetBps[assetIndex];
        if (bps != 0) return bps;
        if (assetIndex == 0) return 75;
        if (assetIndex == 1) return 25;
        if (assetIndex == 2) return 40;
        if (assetIndex == 3) return 400;
        if (assetIndex == 4) return 150;
        if (assetIndex == 5) return 250;
        return 0;
    }

    function _updateOracleConfig(address[] memory signers, uint8 threshold) internal {
        require(signers.length > 0, "Signers required");
        require(threshold > 0 && threshold <= signers.length, "Invalid threshold");

        authorisedSigners = signers;
        uniqueSignersThreshold = threshold;

        emit OracleConfigUpdated(threshold, signers);
    }
}
