// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuctionOpen.sol";

contract AuctionFactory {
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed auction,
        address indexed seller,
        address currency,
        string metadataURI,
        string imageURI
    );

    uint256 public nextId;
    address[] public auctions;

    function createAuction(
        address currency,
        uint256 reservePrice,
        uint256 minIncrement,
        uint256 durationSeconds,
        string calldata metadataURI,
        string calldata imageURI,
        address admin
    ) external returns (uint256 auctionId, address auction) {
        auctionId = nextId++;
        AuctionOpen a = new AuctionOpen(
            msg.sender,
            currency,
            reservePrice,
            minIncrement,
            durationSeconds,
            metadataURI,
            imageURI,
            admin
        );
        auction = address(a);
        auctions.push(auction);

        emit AuctionCreated(auctionId, auction, msg.sender, currency, metadataURI, imageURI);
    }

    function getAuctions(uint256 offset, uint256 limit) external view returns (address[] memory out) {
        uint256 n = auctions.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;

        out = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) out[i - offset] = auctions[i];
    }
}
