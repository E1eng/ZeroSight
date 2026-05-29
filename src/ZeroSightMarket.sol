// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {AddressUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

interface IRedstonePriceFeed {
    function getLatestPrice() external view returns (uint256);
}

contract ZeroSightMarket is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using AddressUpgradeable for address payable;

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

    struct BetInfo {
        uint256 amount;
        MarketCategory category;
        string vaultId;
        bool claimed;
        uint256 placedAt;
    }

    mapping(address => BetInfo[]) private userBets;

    uint256 public totalPool;
    MarketStatus public marketStatus;
    uint256 public deadline;
    uint256 public openingPrice;
    uint256 public resolvedPrice;
    uint256 public winningChoice;
    address public resolvedFeed;

    event BetPlaced(address indexed bettor, string vaultId, MarketCategory category, uint256 amount);
    event MarketLocked(uint256 timestamp);
    event MarketResolved(address indexed feed, uint256 resolvedPrice, uint256 winningChoice);
    event WinningsClaimed(address indexed bettor, uint256 amount, uint256 userChoice);

    modifier onlyWhileOpen() {
        require(marketStatus == MarketStatus.Open, "Market not open");
        _;
    }

    modifier onlyResolved() {
        require(marketStatus == MarketStatus.Resolved, "Market not resolved");
        _;
    }

    function initialize(uint256 _deadline, address _cryptoFeed) external initializer {
        require(_deadline > block.timestamp, "Invalid deadline");
        require(_cryptoFeed != address(0), "Invalid feed");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        marketStatus = MarketStatus.Open;
        deadline = _deadline;
        openingPrice = IRedstonePriceFeed(_cryptoFeed).getLatestPrice();
    }

    receive() external payable {
        revert("Direct payments disabled");
    }

    function placeBet(string memory vaultId, MarketCategory category) external payable onlyWhileOpen {
        require(bytes(vaultId).length > 0, "Vault required");
        require(msg.value > 0, "Zero stake");
        require(block.timestamp < deadline, "Betting closed");

        totalPool += msg.value;
        userBets[msg.sender].push(
            BetInfo({
                amount: msg.value,
                category: category,
                vaultId: vaultId,
                claimed: false,
                placedAt: block.timestamp
            })
        );

        emit BetPlaced(msg.sender, vaultId, category, msg.value);
    }

    function lockMarket() external onlyOwner onlyWhileOpen {
        require(block.timestamp >= deadline, "Deadline not reached");
        marketStatus = MarketStatus.Locked;
        emit MarketLocked(block.timestamp);
    }

    function resolveCryptoMarket(address assetFeed) external onlyOwner {
        require(marketStatus != MarketStatus.Resolved, "Already resolved");
        require(block.timestamp > deadline, "Resolution blocked");

        if (marketStatus == MarketStatus.Open) {
            marketStatus = MarketStatus.Locked;
            emit MarketLocked(block.timestamp);
        }

        uint256 price = IRedstonePriceFeed(assetFeed).getLatestPrice();
        resolvedFeed = assetFeed;
        resolvedPrice = price;
        winningChoice = price >= openingPrice ? 1 : 0;
        marketStatus = MarketStatus.Resolved;

        emit MarketResolved(assetFeed, price, winningChoice);
    }

    function claimWinnings(uint256 userChoice, bytes memory decryptedPayload) external nonReentrant onlyResolved {
        require(userChoice == winningChoice, "Losing choice");

        bytes32 payloadHash = keccak256(decryptedPayload);
        uint256 payout;
        BetInfo[] storage bets = userBets[msg.sender];

        for (uint256 i = 0; i < bets.length; i++) {
            BetInfo storage bet = bets[i];
            if (bet.claimed) continue;
            if (payloadHash != keccak256(bytes(bet.vaultId))) continue;

            // Placeholder: return stake for matching winners until full parimutuel math is implemented.
            bet.claimed = true;
            payout += bet.amount;
        }

        require(payout > 0, "No winnings available");
        require(payout <= totalPool, "Insufficient pool");

        totalPool -= payout;
        payable(msg.sender).sendValue(payout);

        emit WinningsClaimed(msg.sender, payout, userChoice);
    }

    function getUserBets(address bettor) external view returns (BetInfo[] memory) {
        return userBets[bettor];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
