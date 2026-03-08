// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AuctionMetrics
 * @notice Analytics sink deployed on Ethereum Sepolia.
 *         The server mirrors events from Robinhood / Arb Sepolia here
 *         so Dune Analytics can index and decode them.
 */
contract AuctionMetrics is Ownable {
    event AuctionCreated(
        uint32  indexed sourceChainId,
        address indexed auction,
        address indexed seller,
        address currency,
        string  metadataURI
    );

    event Activated(
        uint32  indexed sourceChainId,
        address indexed auction,
        uint256 startTime,
        uint256 endTime
    );

    event BidPlaced(
        uint32  indexed sourceChainId,
        address indexed auction,
        address indexed bidder,
        uint256 amount
    );

    event Settled(
        uint32  indexed sourceChainId,
        address indexed auction,
        address indexed winner,
        uint256 sellerPayout,
        uint256 fee
    );

    constructor(address admin) Ownable(admin) {}

    function reportAuctionCreated(
        uint32  sourceChainId,
        address auction,
        address seller,
        address currency,
        string calldata metadataURI
    ) external onlyOwner {
        emit AuctionCreated(sourceChainId, auction, seller, currency, metadataURI);
    }

    function reportActivated(
        uint32  sourceChainId,
        address auction,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner {
        emit Activated(sourceChainId, auction, startTime, endTime);
    }

    function reportBidPlaced(
        uint32  sourceChainId,
        address auction,
        address bidder,
        uint256 amount
    ) external onlyOwner {
        emit BidPlaced(sourceChainId, auction, bidder, amount);
    }

    function reportSettled(
        uint32  sourceChainId,
        address auction,
        address winner,
        uint256 sellerPayout,
        uint256 fee
    ) external onlyOwner {
        emit Settled(sourceChainId, auction, winner, sellerPayout, fee);
    }
}
