export interface BidRecord {
  amount: string;
  txHash: string;
  timestamp: number;
}

export interface WinRecord {
  auction: string;
  amount: string;
  timestamp: number;
}

function getBidKey(auctionAddress: string, bidderAddress: string) {
  return `bids:${bidderAddress.toLowerCase()}:${auctionAddress.toLowerCase()}`;
}

function getWinKey(winnerAddress: string) {
  return `wins:${winnerAddress.toLowerCase()}`;
}

export function recordBid(auctionAddress: string, bidderAddress: string | undefined, bid: BidRecord) {
  if (typeof window === "undefined" || !bidderAddress) return;
  const key = getBidKey(auctionAddress, bidderAddress);
  const existing: BidRecord[] = JSON.parse(localStorage.getItem(key) ?? "[]");
  existing.push(bid);
  localStorage.setItem(key, JSON.stringify(existing));
}

export function getBids(auctionAddress: string, bidderAddress: string | undefined): BidRecord[] {
  if (typeof window === "undefined" || !bidderAddress) return [];
  const key = getBidKey(auctionAddress, bidderAddress);
  return JSON.parse(localStorage.getItem(key) ?? "[]");
}

export function getAllBiddedAuctions(bidderAddress: string | undefined): string[] {
  if (typeof window === "undefined" || !bidderAddress) return [];
  const prefix = `bids:${bidderAddress.toLowerCase()}:`;
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

export function recordWin(auctionAddress: string, winnerAddress: string | undefined, win: Omit<WinRecord, "auction">) {
  if (typeof window === "undefined" || !winnerAddress) return;
  const key = getWinKey(winnerAddress);
  const auction = auctionAddress.toLowerCase();
  const existing: WinRecord[] = JSON.parse(localStorage.getItem(key) ?? "[]");
  const next: WinRecord[] = [
    { auction, ...win },
    ...existing.filter((entry) => entry.auction.toLowerCase() !== auction),
  ].slice(0, 50);
  localStorage.setItem(key, JSON.stringify(next));
}

export function getWins(winnerAddress: string | undefined): WinRecord[] {
  if (typeof window === "undefined" || !winnerAddress) return [];
  return JSON.parse(localStorage.getItem(getWinKey(winnerAddress)) ?? "[]");
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
