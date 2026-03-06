import { AuctionState } from "./constants";

export interface AuctionMeta {
  id: string;           // factory index as string
  address: string;      // contract address
  seller: string;
  currency: string;
  metadataURI: string;
  imageURI: string;
}

export interface AuctionLiveState {
  address: string;
  state: AuctionState;
  startTime: number;    // unix seconds
  endTime: number;
  highestBidder: string;
  highestBid: string;   // wei as string
}

export interface BidEvent {
  auctionAddress: string;
  bidder: string;
  amount: string;       // wei as string
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface LeaderChangeEvent {
  auctionAddress: string;
  leader: string;
  amount: string;
  txHash: string;
}

// Socket.io event map (server → client)
export interface ServerToClientEvents {
  "bid:placed": (e: BidEvent) => void;
  "leader:changed": (e: LeaderChangeEvent) => void;
  "auction:activated": (e: { auctionAddress: string; startTime: number; endTime: number }) => void;
  "auction:ended": (e: { auctionAddress: string; winner: string; amount: string }) => void;
  "auction:settled": (e: { auctionAddress: string; sellerPayout: string; fee: string }) => void;
}

// Socket.io event map (client → server)
export interface ClientToServerEvents {
  "join:auction": (auctionAddress: string) => void;
  "leave:auction": (auctionAddress: string) => void;
}
