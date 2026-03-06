// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AuctionOpen is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    enum State { LOCKED, COUNTDOWN, ACTIVE, ENDED, SETTLED }

    event Activated(uint256 startTime, uint256 endTime);
    event BidPlaced(address indexed bidder, uint256 amount);
    event LeaderChanged(address indexed leader, uint256 amount);
    event Ended(address indexed winner, uint256 amount);
    event Settled(address indexed seller, address indexed winner, uint256 sellerPayout, uint256 fee);

    address public immutable seller;
    IERC20  public immutable currency;

    uint256 public immutable reservePrice;
    uint256 public immutable minIncrement;
    uint256 public immutable durationSeconds;

    string public metadataURI;
    string public imageURI;

    address public admin;

    State public state;
    uint256 public startTime;
    uint256 public endTime;

    address public highestBidder;
    uint256 public highestBid;

    uint256 public feeBps = 200; // 2%
    address public feeRecipient;

    constructor(
        address _seller,
        address _currency,
        uint256 _reservePrice,
        uint256 _minIncrement,
        uint256 _durationSeconds,
        string memory _metadataURI,
        string memory _imageURI,
        address _admin
    ) Ownable(_admin) {
        seller = _seller;
        currency = IERC20(_currency);
        reservePrice = _reservePrice;
        minIncrement = _minIncrement;
        durationSeconds = _durationSeconds;
        metadataURI = _metadataURI;
        imageURI = _imageURI;

        admin = _admin;
        feeRecipient = _admin;
        state = State.LOCKED;
    }

    function activate() external onlyOwner whenNotPaused {
        require(state == State.LOCKED, "already activated");
        startTime = block.timestamp + 150; // 2m30 countdown
        endTime = startTime + durationSeconds;
        state = State.COUNTDOWN;
        emit Activated(startTime, endTime);
    }

    function currentState() public view returns (State) {
        if (state == State.COUNTDOWN && block.timestamp >= startTime) return State.ACTIVE;
        if ((state == State.COUNTDOWN || state == State.ACTIVE) && block.timestamp >= endTime) return State.ENDED;
        return state;
    }

    function bid(uint256 amount) external nonReentrant whenNotPaused {
        State cs = currentState();
        require(cs == State.ACTIVE, "not active");
        require(amount >= reservePrice, "below reserve");
        require(amount >= highestBid + minIncrement, "too low");

        currency.safeTransferFrom(msg.sender, address(this), amount);

        if (highestBidder != address(0)) {
            currency.safeTransfer(highestBidder, highestBid);
        }

        highestBidder = msg.sender;
        highestBid = amount;

        emit BidPlaced(msg.sender, amount);
        emit LeaderChanged(msg.sender, amount);
    }

    function end() external whenNotPaused {
        State cs = currentState();
        require(cs == State.ENDED, "not ended");
        require(state != State.SETTLED, "already settled");
        state = State.ENDED;
        emit Ended(highestBidder, highestBid);
    }

    function settle() external nonReentrant whenNotPaused {
        State cs = currentState();
        require(cs == State.ENDED, "not ended");
        require(state != State.SETTLED, "already settled");

        state = State.SETTLED;

        if (highestBidder == address(0)) {
            emit Settled(seller, address(0), 0, 0);
            return;
        }

        uint256 fee = (highestBid * feeBps) / 10_000;
        uint256 payout = highestBid - fee;

        currency.safeTransfer(feeRecipient, fee);
        currency.safeTransfer(seller, payout);

        emit Settled(seller, highestBidder, payout, fee);
    }

    function setFee(uint256 _feeBps, address _feeRecipient) external onlyOwner {
        require(_feeBps <= 1000, "fee too high");
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
