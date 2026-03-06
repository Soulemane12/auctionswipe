export interface BidRecord {
  amount: string;
  txHash: string;
  timestamp: number;
}

export function recordBid(auctionAddress: string, bid: BidRecord) {
  if (typeof window === "undefined") return;
  const key = `bids:${auctionAddress.toLowerCase()}`;
  const existing: BidRecord[] = JSON.parse(localStorage.getItem(key) ?? "[]");
  existing.push(bid);
  localStorage.setItem(key, JSON.stringify(existing));
}

export function getBids(auctionAddress: string): BidRecord[] {
  if (typeof window === "undefined") return [];
  const key = `bids:${auctionAddress.toLowerCase()}`;
  return JSON.parse(localStorage.getItem(key) ?? "[]");
}

export function recordView(auctionAddress: string) {
  if (typeof window === "undefined") return;
  const existing: string[] = JSON.parse(localStorage.getItem("viewedAuctions") ?? "[]");
  const addr = auctionAddress.toLowerCase();
  if (!existing.includes(addr)) {
    existing.push(addr);
    localStorage.setItem("viewedAuctions", JSON.stringify(existing));
  }
}

export function getViewedAuctions(): string[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("viewedAuctions") ?? "[]");
}
