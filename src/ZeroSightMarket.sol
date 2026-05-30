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
 *         Features Enterprise mechanics: 2% protocol fee, Time-Weighted Shares,
 *         Anti-griefing distribution, and minimum bet limits.
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

    // ──────────────────────────── Constants ──────────────────────────

    uint256 public constant MIN_BET = 1e16; // 0.01 IP
    uint256 public constant PROTOCOL_FEE_PERCENT = 2; // 2%

    // ──────────────────────────── Enums ────────────────────────────

    enum MarketStatus {
        Open,
        Locked,
        Resolved
    }

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
        uint256 shares; // Calculated based on time-weighting (Multiplier 1x-2x)
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
        uint256 openedAt; // Timestamp when market opened for time-weighting
        uint256 deadline;
        uint256 openingPrice;
        uint256 resolvedPrice;
        uint256 winningChoice; // 0 = Down, 1 = Up
        uint256[2] totalSharesByChoice;
        uint256 payoutPool; // totalPool - protocol fee
        uint256 winningSharesTotal;
        uint256 distributionIndex;
        address[] bettors;
    }

    // ──────────────────────────── State ────────────────────────────

    mapping(uint8 => FeedConfig) private feedConfigs;
    mapping(uint8 => MarketState) public markets;
    mapping(uint8 => mapping(address => BetInfo[])) private userBets;
    mapping(uint8 => mapping(address => bool)) private hasBet;

    address[] private authorisedSigners;
    uint8 private uniqueSignersThreshold;

    // ──────────────────────────── Events ───────────────────────────

    event BetPlaced(address indexed bettor, string vaultId, uint8 assetIndex, uint256 amount);
    event ChoicesRevealed(uint8 indexed assetIndex, uint256 count);
    event MarketLocked(uint8 indexed assetIndex, uint256 timestamp);
    event MarketResolved(uint8 indexed assetIndex, uint256 resolvedPrice, uint256 winningChoice, uint256 feeTaken);
    event WinningsDistributed(uint8 indexed assetIndex, address indexed bettor, uint256 amount);
    event WinningsDistributionFailed(uint8 indexed assetIndex, address indexed bettor, uint256 amount);
    event FeedConfigUpdated(uint8 indexed assetIndex, bytes32 dataFeedId);
    event OracleConfigUpdated(uint8 uniqueSignersThreshold, address[] signers);

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyWhileOpen(uint8 assetIndex) {
        require(markets[assetIndex].status == MarketStatus.Open, "Market not open");
        _;
    }

    modifier onlyResolved(uint8 assetIndex) {
        require(markets[assetIndex].status == MarketStatus.Resolved, "Market not resolved");
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

    // ──────────────────────────── UUPS ─────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────────────── Core Logic ───────────────────────

    receive() external payable {
        revert("Direct payments disabled");
    }

    function placeBet(
        string memory vaultId,
        uint8 assetIndex
    ) external payable onlyWhileOpen(assetIndex) {
        require(bytes(vaultId).length > 0, "Vault required");
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
                shares: 0, // Calculated at reveal
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

    function revealChoices(
        uint8 assetIndex,
        address[] calldata bettorAddresses,
        string[] calldata vaultIds,
        uint8[] calldata choices
    ) external onlyOwner {
        MarketState storage m = markets[assetIndex];
        require(m.status == MarketStatus.Locked || m.status == MarketStatus.Open, "Resolution blocked");
        require(block.timestamp >= m.deadline, "Deadline not reached");
        require(bettorAddresses.length == choices.length && bettorAddresses.length == vaultIds.length, "Length mismatch");

        if (m.status == MarketStatus.Open) {
            m.status = MarketStatus.Locked;
            emit MarketLocked(assetIndex, block.timestamp);
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
                
                if (!bet.choiceRevealed && bet.assetIndex == assetIndex && keccak256(bytes(bet.vaultId)) == keccak256(bytes(vaultId))) {
                    bet.direction = choice;
                    bet.choiceRevealed = true;
                    
                    // Time-weighted shares: Multiplier 1x (1000) to 2x (2000)
                    uint256 timeLeft = m.deadline > bet.placedAt ? m.deadline - bet.placedAt : 0;
                    uint256 multiplier = 1000 + ((1000 * timeLeft) / duration);
                    bet.shares = (bet.amount * multiplier) / 1000;
                    
                    m.totalSharesByChoice[choice] += bet.shares;
                    revealedCount++;
                    break;
                }
            }
        }

        emit ChoicesRevealed(assetIndex, revealedCount);
    }

    function lockMarket(uint8 assetIndex) external onlyOwner onlyWhileOpen(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(block.timestamp >= m.deadline, "Deadline not reached");
        m.status = MarketStatus.Locked;
        emit MarketLocked(assetIndex, block.timestamp);
    }

    function resolveMarket(uint8 assetIndex) external onlyOwner {
        MarketState storage m = markets[assetIndex];
        require(m.status != MarketStatus.Resolved, "Already resolved");
        require(block.timestamp > m.deadline, "Resolution blocked");
        require(m.openingPrice > 0, "Opening price missing");

        if (m.status == MarketStatus.Open) {
            m.status = MarketStatus.Locked;
            emit MarketLocked(assetIndex, block.timestamp);
        }

        bytes32 feedId = feedConfigs[assetIndex].dataFeedId;
        require(feedId != bytes32(0), "Feed not configured");

        uint256 price = getOracleNumericValueFromTxMsg(feedId);
        require(price > 0, "Invalid oracle price");

        m.resolvedPrice = price;
        m.winningChoice = price >= m.openingPrice ? 1 : 0;
        
        // Protocol Fee Deduction (2%)
        uint256 fee = (m.totalPool * PROTOCOL_FEE_PERCENT) / 100;
        m.payoutPool = m.totalPool - fee;
        m.winningSharesTotal = m.totalSharesByChoice[m.winningChoice];
        m.distributionIndex = 0;
        m.status = MarketStatus.Resolved;

        // Safely transfer fee to treasury/owner
        if (fee > 0) {
            m.totalPool -= fee;
            (bool success, ) = owner().call{value: fee}("");
            require(success, "Fee transfer failed");
        }

        emit MarketResolved(assetIndex, price, m.winningChoice, fee);
    }

    // ──────────────────────────── Auto-Distribution ────────────────

    function distributeWinnings(uint8 assetIndex, uint256 batchSize) external onlyOwner nonReentrant onlyResolved(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(m.distributionIndex < m.bettors.length, "Distribution complete");

        uint256 end = m.distributionIndex + batchSize;
        if (end > m.bettors.length) end = m.bettors.length;

        if (m.winningSharesTotal == 0) {
            m.distributionIndex = end;
            return;
        }

        for (uint256 i = m.distributionIndex; i < end; i++) {
            address bettor = m.bettors[i];
            BetInfo[] storage bets = userBets[assetIndex][bettor];

            for (uint256 j = 0; j < bets.length; j++) {
                BetInfo storage bet = bets[j];
                if (bet.distributed) continue;

                bet.distributed = true;

                if (!bet.choiceRevealed || bet.direction != m.winningChoice) continue;

                uint256 payout = (bet.shares * m.payoutPool) / m.winningSharesTotal;
                if (payout > m.totalPool) payout = m.totalPool;
                
                // Anti-Griefing safe push
                (bool success, ) = bettor.call{value: payout}("");
                if (success) {
                    m.totalPool -= payout;
                    emit WinningsDistributed(assetIndex, bettor, payout);
                } else {
                    emit WinningsDistributionFailed(assetIndex, bettor, payout);
                    // Payout stays in m.totalPool and will be swept later
                }
            }
        }

        m.distributionIndex = end;
    }

    function isFullyDistributed(uint8 assetIndex) external view returns (bool) {
        return markets[assetIndex].distributionIndex >= markets[assetIndex].bettors.length;
    }

    function sweepUnclaimed(uint8 assetIndex) external onlyOwner onlyResolved(assetIndex) {
        MarketState storage m = markets[assetIndex];
        require(m.distributionIndex >= m.bettors.length, "Distribution pending");
        uint256 remainingPool = m.totalPool;
        if (remainingPool > 0) {
            m.totalPool = 0;
            (bool success, ) = owner().call{value: remainingPool}("");
            require(success, "Sweep failed");
        }
    }

    // ──────────────────────────── Market Lifecycle ─────────────────

    function startNextMarket(
        MarketCategory category,
        uint8 assetIndex,
        uint256 newDeadline
    ) external onlyOwner {
        MarketState storage m = markets[assetIndex];
        
        require(m.status == MarketStatus.Resolved, "Market not settled");
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
    }

    // ──────────────────────────── View Helpers ─────────────────────

    function getUserBets(uint8 assetIndex, address bettor) external view returns (BetInfo[] memory) {
        return userBets[assetIndex][bettor];
    }

    function getFeedConfig(uint8 assetIndex) external view returns (FeedConfig memory) {
        return feedConfigs[assetIndex];
    }

    function getBettorCount(uint8 assetIndex) external view returns (uint256) {
        return markets[assetIndex].bettors.length;
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
