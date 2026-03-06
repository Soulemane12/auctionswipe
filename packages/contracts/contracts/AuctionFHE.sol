// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint128, ebool, InEuint128, Common} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AuctionFHE
 * @notice Privacy demo: bid *amounts* are encrypted in contract storage.
 *         Bid amounts are never visible in logs or storage.
 *         Identity (msg.sender) and leader address remain public — this is the
 *         "strategy privacy" tier (hide how much, not who).
 *
 * Decrypt model: FHE.decrypt() is async in CoFHE. The contract queues a decrypt
 * request; the result arrives off-chain via the CoFHE co-processor callback.
 * Leader identity is resolved by admin calling resolveWinner() after auction end.
 */
contract AuctionFHE is Ownable {
    event Activated(uint256 startTime, uint256 endTime);
    event EncryptedBidPlaced(address indexed bidder); // amount intentionally omitted
    event WinnerResolved(address indexed winner);
    event Settled(address indexed winner);

    uint256 public startTime;
    uint256 public endTime;

    // encrypted highest bid — stored as ciphertext hash (bytes32 alias)
    euint128 private _highestBidEnc;

    // leader address — updated optimistically; finalized by resolveWinner()
    address public highestBidder;

    // maps bidder → their encrypted bid handle (so they can request decryption of their own bid)
    mapping(address => euint128) private _bids;

    bool public settled;

    constructor(address admin) Ownable(admin) {}

    // ── Admin ──────────────────────────────────────────────────────────────

    function activate(uint256 durationSeconds) external onlyOwner {
        require(startTime == 0, "already activated");
        startTime = block.timestamp + 150; // 2m30 countdown
        endTime = startTime + durationSeconds;
        emit Activated(startTime, endTime);
    }

    /**
     * @notice Admin calls this after auction ends + off-chain decrypt reveals winner.
     *         The co-processor decrypts _highestBidEnc; admin reads it and
     *         submits the winner address here to finalise.
     */
    function resolveWinner(address winner) external onlyOwner {
        require(block.timestamp >= endTime, "auction not ended");
        highestBidder = winner;
        emit WinnerResolved(winner);
    }

    function settle() external onlyOwner {
        require(highestBidder != address(0), "winner not resolved");
        require(!settled, "already settled");
        settled = true;
        // Payment logic handled externally / by wrapping contract
        emit Settled(highestBidder);
    }

    // ── Bidding ────────────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted bid.
     *         - bidInput is produced client-side using the CoFHE SDK
     *         - FHE.gt + FHE.select update the encrypted highest bid without
     *           revealing either value to observers
     *         - No amount appears in logs or storage
     */
    function bid(InEuint128 calldata bidInput) external {
        require(
            block.timestamp >= startTime && block.timestamp < endTime,
            "not active"
        );

        euint128 bidEnc = FHE.asEuint128(bidInput);

        // Allow this contract to operate on the bidder's ciphertext
        FHE.allow(bidEnc, address(this));

        // If we have a previous highest bid, pick the greater encrypted value.
        // Neither value is revealed — comparison happens inside the co-processor.
        if (Common.isInitialized(_highestBidEnc)) {
            ebool isHigher = FHE.gt(bidEnc, _highestBidEnc);
            _highestBidEnc = FHE.select(isHigher, bidEnc, _highestBidEnc);
        } else {
            _highestBidEnc = bidEnc;
        }

        // Store bidder's handle so they can later view their own bid
        _bids[msg.sender] = bidEnc;

        emit EncryptedBidPlaced(msg.sender);
    }

    // ── Access control for decryption ──────────────────────────────────────

    /**
     * @notice Lets the caller request decryption of their own bid via the SDK.
     */
    function allowSelfToViewOwnBid() external {
        require(Common.isInitialized(_bids[msg.sender]), "no bid found");
        FHE.allowSender(_bids[msg.sender]);
    }

    /**
     * @notice Admin-only: permit a specific address to decrypt the highest bid.
     *         Typically called after auction ends so admin can verify winner off-chain.
     */
    function allowAddressToViewHighest(address account) external onlyOwner {
        require(Common.isInitialized(_highestBidEnc), "no bids yet");
        FHE.allow(_highestBidEnc, account);
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function isActive() external view returns (bool) {
        return block.timestamp >= startTime && block.timestamp < endTime;
    }

    function hasEnded() external view returns (bool) {
        return startTime > 0 && block.timestamp >= endTime;
    }
}
