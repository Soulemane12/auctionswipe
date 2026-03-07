"use client";

import { use, useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseAbi, parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { socket } from "@/lib/socket";
import { recordBid, recordView, getBids, BidRecord } from "@/lib/history";

// ── ABIs ──────────────────────────────────────────────────────────────────────

const auctionAbi = parseAbi([
  "function currentState() view returns (uint8)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function highestBidder() view returns (address)",
  "function highestBid() view returns (uint256)",
  "function reservePrice() view returns (uint256)",
  "function minIncrement() view returns (uint256)",
  "function metadataURI() view returns (string)",
  "function imageURI() view returns (string)",
  "function seller() view returns (address)",
  "function currency() view returns (address)",
  "function bid(uint256 amount) external",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATE_CHIP: Record<number, { label: string; color: string }> = {
  0: { label: "🔒 LOCKED",     color: "bg-zinc-800 text-zinc-400" },
  1: { label: "⏳ COUNTDOWN",  color: "bg-yellow-900 text-yellow-300" },
  2: { label: "🔥 ACTIVE",     color: "bg-red-900 text-red-300" },
  3: { label: "✅ ENDED",      color: "bg-green-900 text-green-300" },
  4: { label: "💸 SETTLED",    color: "bg-blue-900 text-blue-300" },
};

// ── Live event types ───────────────────────────────────────────────────────────

interface LiveEvent {
  type: string;
  text: string;
  ts: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuctionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: auctionAddress } = use(params);
  const addr = auctionAddress as `0x${string}`;

  const { address: userAddress, isConnected } = useAccount();
  const [bidAmount, setBidAmount] = useState("");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [localBids, setLocalBids] = useState<BidRecord[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [approvalDone, setApprovalDone] = useState(false);

  // ── Contract reads ────────────────────────────────────────────────────────

  const { data: state, refetch: refetchState } = useReadContract({
    address: addr,
    abi: auctionAbi,
    functionName: "currentState",
  });

  const { data: startTime } = useReadContract({ address: addr, abi: auctionAbi, functionName: "startTime" });
  const { data: endTime }   = useReadContract({ address: addr, abi: auctionAbi, functionName: "endTime" });
  const { data: highestBidder, refetch: refetchLeader } = useReadContract({ address: addr, abi: auctionAbi, functionName: "highestBidder" });
  const { data: highestBid,    refetch: refetchBid }    = useReadContract({ address: addr, abi: auctionAbi, functionName: "highestBid" });
  const { data: reservePrice }  = useReadContract({ address: addr, abi: auctionAbi, functionName: "reservePrice" });
  const { data: minIncrement }  = useReadContract({ address: addr, abi: auctionAbi, functionName: "minIncrement" });
  const { data: metadataURI }   = useReadContract({ address: addr, abi: auctionAbi, functionName: "metadataURI" });
  const { data: imageURI }      = useReadContract({ address: addr, abi: auctionAbi, functionName: "imageURI" });
  const { data: sellerAddr }    = useReadContract({ address: addr, abi: auctionAbi, functionName: "seller" });
  const { data: currencyAddr }  = useReadContract({ address: addr, abi: auctionAbi, functionName: "currency" });

  const tokenAddr = currencyAddr as `0x${string}` | undefined;

  const { data: tokenSymbol }   = useReadContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol", query: { enabled: !!tokenAddr } });
  const { data: tokenDecimals } = useReadContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals", query: { enabled: !!tokenAddr } });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: userAddress && tokenAddr ? [userAddress, addr] : undefined,
    query: { enabled: !!tokenAddr && !!userAddress },
  });

  const decimals = tokenDecimals ? Number(tokenDecimals) : 18;

  // Minimum valid bid: max(reservePrice, highestBid + minIncrement)
  const minBidRaw = (() => {
    const r = reservePrice as bigint | undefined;
    const h = highestBid as bigint | undefined;
    const m = minIncrement as bigint | undefined;
    if (!r) return undefined;
    const fromHighest = h && m ? h + m : 0n;
    return fromHighest > r ? fromHighest : r;
  })();
  const minBidFormatted = minBidRaw ? formatUnits(minBidRaw, decimals) : undefined;

  // ── Writes ────────────────────────────────────────────────────────────────

  const { writeContract, isPending, data: txHash } = useWriteContract();

  const handleApprove = () => {
    if (!tokenAddr || !bidAmount) return;
    const amount = parseUnits(bidAmount, decimals);
    writeContract({ address: tokenAddr, abi: erc20Abi, functionName: "approve", args: [addr, amount] });
  };

  const handleBid = () => {
    if (!bidAmount) return;
    const amount = parseUnits(bidAmount, decimals);
    writeContract({ address: addr, abi: auctionAbi, functionName: "bid", args: [amount] });
  };

  // Record bid in localStorage when tx hash arrives
  useEffect(() => {
    if (txHash && bidAmount) {
      recordBid(auctionAddress, { amount: bidAmount, txHash, timestamp: Date.now() });
      setLocalBids(getBids(auctionAddress));
      setApprovalDone(true);
      setTimeout(() => { refetchState(); refetchLeader(); refetchBid(); refetchAllowance(); }, 4000);
    }
  }, [txHash]);

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    recordView(auctionAddress);
    setLocalBids(getBids(auctionAddress));

    socket.emit("join:auction", auctionAddress);

    socket.on("bid:placed", (e) => {
      if (e.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()) return;
      const short = `${e.bidder.slice(0, 6)}…${e.bidder.slice(-4)}`;
      addEvent(`${short} placed a bid`);
      refetchBid();
    });

    socket.on("leader:changed", (e) => {
      if (e.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()) return;
      const short = `${e.leader.slice(0, 6)}…${e.leader.slice(-4)}`;
      addEvent(`${short} is now leading`);
      refetchLeader();
      refetchBid();
    });

    socket.on("auction:activated", (e) => {
      if (e.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()) return;
      addEvent("Auction activated — countdown started!");
      refetchState();
    });

    socket.on("auction:ended", (e) => {
      if (e.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()) return;
      addEvent("Auction ended");
      refetchState();
    });

    socket.on("auction:settled", (e) => {
      if (e.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()) return;
      addEvent("Auction settled");
      refetchState();
    });

    return () => {
      socket.emit("leave:auction", auctionAddress);
      socket.off("bid:placed");
      socket.off("leader:changed");
      socket.off("auction:activated");
      socket.off("auction:ended");
      socket.off("auction:settled");
    };
  }, [auctionAddress]);

  // ── Countdown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const stateNum = state !== undefined ? Number(state) : -1;
    const targetTime = stateNum === 1 ? startTime : stateNum === 2 ? endTime : null;
    if (!targetTime) { setCountdown(null); return; }

    const tick = () => {
      const secs = Number(targetTime) - Math.floor(Date.now() / 1000);
      setCountdown(secs > 0 ? secs : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, startTime, endTime]);

  function addEvent(text: string) {
    setLiveEvents((prev) => [{ type: "info", text, ts: Date.now() }, ...prev].slice(0, 20));
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const stateNum = state !== undefined ? Number(state) : -1;
  const chip = STATE_CHIP[stateNum] ?? { label: "…", color: "bg-zinc-800 text-zinc-400" };
  const formattedHighest = highestBid ? formatUnits(highestBid as bigint, decimals) : "—";
  const needsApproval = allowance !== undefined && bidAmount
    ? (allowance as bigint) < parseUnits(bidAmount || "0", decimals)
    : true;
  const isActive = stateNum === 2;

  const fmtTime = (secs: number) =>
    `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  const short = (s: string) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <Link href="/" className="text-white/50 hover:text-white text-sm">← Back</Link>
        <ConnectButton />
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        {/* Image */}
        {imageURI && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageURI as string} alt="" className="w-full aspect-square object-cover rounded-2xl" />
        )}

        {/* Title + status */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h1 className="text-2xl font-bold">{(metadataURI as string) || "Auction"}</h1>
            <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${chip.color}`}>
              {chip.label}
            </span>
          </div>
          <p className="text-white/40 text-sm font-mono">{short(sellerAddr as string)}</p>
        </div>

        {/* Countdown */}
        {countdown !== null && (
          <div className="text-center py-4 border border-white/10 rounded-xl">
            <p className="text-white/40 text-xs mb-1">
              {stateNum === 1 ? "starts in" : "ends in"}
            </p>
            <p className="text-5xl font-mono font-bold">{fmtTime(countdown)}</p>
          </div>
        )}

        {/* Current leader */}
        <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl">
          <div>
            <p className="text-white/40 text-xs mb-1">Current Leader</p>
            <p className="font-mono text-sm">{short(highestBidder as string)}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-xs mb-1">Highest Bid</p>
            <p className="font-semibold">{formattedHighest} {tokenSymbol as string ?? "tokens"}</p>
          </div>
        </div>

        {/* Bid info */}
        <div className="flex justify-between text-sm text-white/40">
          <span>Reserve: {reservePrice ? formatUnits(reservePrice as bigint, decimals) : "—"} {tokenSymbol as string ?? ""}</span>
          <span>Min increment: {minIncrement ? formatUnits(minIncrement as bigint, decimals) : "—"}</span>
        </div>

        {/* Bid form */}
        {isActive && (
          <div className="space-y-3">
            {!isConnected ? (
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            ) : (
              <>
                <div className="relative">
                  <input
                    type="number"
                    placeholder={minBidFormatted ? `Min bid: ${minBidFormatted}` : `Amount in ${tokenSymbol as string ?? "tokens"}`}
                    value={bidAmount}
                    onChange={(e) => { setBidAmount(e.target.value); setApprovalDone(false); }}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/50"
                  />
                  {minBidFormatted && !bidAmount && (
                    <button
                      onClick={() => setBidAmount(minBidFormatted)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white/80 transition-colors"
                    >
                      use min
                    </button>
                  )}
                </div>

                {/* Approve → Bid two-step */}
                {!approvalDone && needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={isPending || !bidAmount}
                    className="w-full bg-white/20 text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-white/30 transition-colors"
                  >
                    {isPending ? "Approving…" : "1. Approve"}
                  </button>
                ) : (
                  <button
                    onClick={handleBid}
                    disabled={isPending || !bidAmount}
                    className="w-full bg-white text-black font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-white/90 transition-colors"
                  >
                    {isPending ? "Placing bid…" : "2. Place Bid"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Live activity feed */}
        {liveEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-white/40 text-xs uppercase tracking-widest">Live Activity</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {liveEvents.map((e) => (
                <div key={e.ts} className="text-sm text-white/70 py-1 border-b border-white/5">
                  {e.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My bid history */}
        {localBids.length > 0 && (
          <div className="space-y-2">
            <p className="text-white/40 text-xs uppercase tracking-widest">My Bids</p>
            <div className="space-y-2">
              {localBids.map((b) => (
                <div key={b.txHash} className="flex justify-between text-sm p-3 bg-white/5 rounded-lg">
                  <span className="text-white/70">{b.amount} {tokenSymbol as string ?? "tokens"}</span>
                  <a
                    href={`https://testnet.explorer.robinhoodchain.com/tx/${b.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-white/30 hover:text-white/70"
                  >
                    {b.txHash.slice(0, 10)}… ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
