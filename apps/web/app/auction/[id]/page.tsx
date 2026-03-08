"use client";

import { use, useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
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

interface AgentPolicySnapshot {
  maxBid: string;
  increment: string;
  cooldownMs: number;
}

interface AgentStatus {
  ready: boolean;
  agentAddress?: string | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

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
  const [wonNotif, setWonNotif]   = useState(false);
  const [lostNotif, setLostNotif] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentPolicy, setAgentPolicy] = useState<AgentPolicySnapshot | null>(null);
  const [agentMaxBid, setAgentMaxBid] = useState("");
  const [agentIncrement, setAgentIncrement] = useState("");
  const [agentCooldown, setAgentCooldown] = useState("5");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const prevStateRef = useRef(-1);
  const lastRecordedBidHashRef = useRef<`0x${string}` | undefined>(undefined);
  const lastApprovedHashRef = useRef<`0x${string}` | undefined>(undefined);
  const submittedBidAmountRef = useRef("");

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
  const stateNum = state !== undefined ? Number(state) : -1;

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

  useEffect(() => {
    if (!agentMaxBid && minBidFormatted) setAgentMaxBid(minBidFormatted);
  }, [agentMaxBid, minBidFormatted]);

  useEffect(() => {
    if (!agentIncrement && minIncrement) {
      setAgentIncrement(formatUnits(minIncrement as bigint, decimals));
    }
  }, [agentIncrement, decimals, minIncrement]);

  // ── Writes ────────────────────────────────────────────────────────────────

  const { writeContract: writeApprove, isPending: isApprovePending, data: approveHash } = useWriteContract();
  const { writeContract: writeBid, isPending: isBidPending, data: bidHash } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: bidConfirmed } = useWaitForTransactionReceipt({ hash: bidHash });

  const handleApprove = () => {
    if (!tokenAddr || !bidAmount) return;
    const amount = parseUnits(bidAmount, decimals);
    writeApprove({ address: tokenAddr, abi: erc20Abi, functionName: "approve", args: [addr, amount], gas: 100_000n });
  };

  const handleBid = () => {
    if (!bidAmount) return;
    submittedBidAmountRef.current = bidAmount;
    const amount = parseUnits(bidAmount, decimals);
    writeBid({ address: addr, abi: auctionAbi, functionName: "bid", args: [amount], gas: 300_000n });
  };

  // Mark approval complete after the approval tx confirms
  useEffect(() => {
    if (!approveConfirmed || !approveHash || approveHash === lastApprovedHashRef.current) return;
    lastApprovedHashRef.current = approveHash;
    setApprovalDone(true);
    void refetchAllowance();
  }, [approveConfirmed, approveHash, refetchAllowance]);

  // Record a local bid only after the bid tx confirms on-chain
  useEffect(() => {
    const submittedBidAmount = submittedBidAmountRef.current;
    if (!bidConfirmed || !bidHash || !submittedBidAmount || bidHash === lastRecordedBidHashRef.current) return;
    lastRecordedBidHashRef.current = bidHash;
    recordBid(auctionAddress, userAddress, { amount: submittedBidAmount, txHash: bidHash, timestamp: Date.now() });
    setLocalBids(getBids(auctionAddress, userAddress));
    submittedBidAmountRef.current = "";
    setTimeout(() => {
      void refetchState();
      void refetchLeader();
      void refetchBid();
      void refetchAllowance();
    }, 4000);
  }, [bidConfirmed, bidHash, auctionAddress, userAddress, refetchAllowance, refetchBid, refetchLeader, refetchState]);

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const loadAgentState = async () => {
      try {
        const [statusRes, policiesRes] = await Promise.all([
          fetch(`${WS_URL}/agent/status`),
          fetch(`${WS_URL}/agent`),
        ]);

        const status = await statusRes.json() as AgentStatus;
        const policies = await policiesRes.json() as Record<string, AgentPolicySnapshot>;
        if (cancelled) return;

        setAgentReady(!!status.ready);
        setAgentAddress(status.agentAddress ?? null);

        const existing = policies[auctionAddress.toLowerCase()] ?? null;
        setAgentPolicy(existing);
        if (existing) {
          setAgentMaxBid(formatUnits(BigInt(existing.maxBid), decimals));
          setAgentIncrement(formatUnits(BigInt(existing.increment), decimals));
          setAgentCooldown(String(Math.max(1, Math.floor(existing.cooldownMs / 1000))));
        }
      } catch {
        if (cancelled) return;
        setAgentReady(false);
      }
    };

    void loadAgentState();
    return () => {
      cancelled = true;
    };
  }, [auctionAddress, decimals]);

  useEffect(() => {
    recordView(auctionAddress);
    setLocalBids(getBids(auctionAddress, userAddress));

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
  }, [auctionAddress, userAddress, refetchBid, refetchLeader, refetchState]);

  // ── Countdown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const stateNum = state !== undefined ? Number(state) : -1;
    const targetTime = stateNum === 1 ? startTime : stateNum === 2 ? endTime : null;
    if (!targetTime) { setCountdown(null); return; }

    let pollId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const secs = Number(targetTime) - Math.floor(Date.now() / 1000);
      if (secs <= 0) {
        setCountdown(0);
        // Poll on-chain every 2s until currentState() flips to ENDED
        if (!pollId) pollId = setInterval(() => refetchState(), 2000);
      } else {
        setCountdown(secs);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      if (pollId) clearInterval(pollId);
    };
  }, [state, startTime, endTime]);

  // Show winner/loser notification when auction ends (live transition OR page load after ended)
  useEffect(() => {
    const sn = stateNum;
    const isEnded = sn === 3 || sn === 4;
    const wasActive = prevStateRef.current === 2;
    const isFirstLoad = prevStateRef.current === -1;
    if (isEnded && (wasActive || isFirstLoad)) {
      const winner = (highestBidder as string)?.toLowerCase();
      const noWinner = !winner || winner === "0x0000000000000000000000000000000000000000";
      if (userAddress && !noWinner && winner === userAddress.toLowerCase()) {
        setWonNotif(true);
      } else if (userAddress && localBids.length > 0) {
        // User bid but either didn't win or bid didn't confirm — show notification regardless
        setLostNotif(true);
        setTimeout(() => setLostNotif(false), 30000);
      }
    }
    if (sn !== -1) prevStateRef.current = sn;
  }, [stateNum, highestBidder, userAddress, localBids.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function addEvent(text: string) {
    setLiveEvents((prev) => [{ type: "info", text, ts: Date.now() }, ...prev].slice(0, 20));
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const chip = STATE_CHIP[stateNum] ?? { label: "…", color: "bg-zinc-800 text-zinc-400" };
  const highestBidRaw = highestBid as bigint | undefined;
  const hasLeader = !!highestBidder && (highestBidder as string).toLowerCase() !== ZERO_ADDRESS && highestBidRaw !== undefined && highestBidRaw > 0n;
  const formattedHighest = hasLeader && highestBidRaw !== undefined ? formatUnits(highestBidRaw, decimals) : "—";
  const needsApproval = allowance !== undefined && bidAmount
    ? (allowance as bigint) < parseUnits(bidAmount || "0", decimals)
    : true;
  const isActive = stateNum === 2;
  const isPending = isApprovePending || isBidPending;
  const isAgentEnabled = !!agentPolicy;

  const fmtTime = (secs: number) =>
    `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  const short = (s: string) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";

  async function handleEnableAgent() {
    if (!tokenAddr || !agentMaxBid || !agentIncrement) return;

    setAgentBusy(true);
    setAgentError(null);
    try {
      const payload = {
        auctionAddress,
        currencyAddress: tokenAddr,
        maxBid: parseUnits(agentMaxBid, decimals).toString(),
        increment: parseUnits(agentIncrement, decimals).toString(),
        cooldownMs: Math.max(1, Number(agentCooldown || "5")) * 1000,
      };

      const res = await fetch(`${WS_URL}/agent/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "failed to enable auto-bid");
      }

      setAgentPolicy({
        maxBid: payload.maxBid,
        increment: payload.increment,
        cooldownMs: payload.cooldownMs,
      });
      addEvent(data.triggered ? "Auto-bid agent enabled and bidding live" : "Auto-bid agent enabled");
    } catch (err) {
      setAgentError((err as Error).message);
    } finally {
      setAgentBusy(false);
    }
  }

  async function handleDisableAgent() {
    setAgentBusy(true);
    setAgentError(null);
    try {
      const res = await fetch(`${WS_URL}/agent/watch/${auctionAddress}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed to disable auto-bid");
      setAgentPolicy(null);
      addEvent("Auto-bid agent disabled");
    } catch (err) {
      setAgentError((err as Error).message);
    } finally {
      setAgentBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <Link href="/" className="text-white/50 hover:text-white text-sm">← Back</Link>
        <ConnectButton />
      </div>

      {/* Winner notification */}
      {wonNotif && (
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0f4c2a, #166534)", border: "1px solid rgba(74,222,128,0.4)", boxShadow: "0 8px 32px rgba(74,222,128,0.2)" }}>
          <div className="flex items-center gap-4 p-5">
            <span style={{ fontSize: 40 }}>🏆</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-green-300 text-lg leading-tight">You won this auction!</p>
              <p className="text-green-400/70 text-sm mt-1">
                Final bid: {formattedHighest} {(tokenSymbol as string) ?? "tokens"}
              </p>
              <p className="text-green-400/50 text-xs mt-0.5">
                The seller will settle and release your item soon.
              </p>
            </div>
            <button onClick={() => setWonNotif(false)} className="text-green-400/40 hover:text-green-400 text-xl self-start leading-none">×</button>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 py-3 font-bold text-sm text-black"
            style={{ background: "linear-gradient(90deg, #4ade80, #22d3ee)" }}
          >
            View in Dashboard →
          </Link>
        </div>
      )}

      {/* Lost notification */}
      {lostNotif && (
        <div className="mx-4 mt-4 p-4 rounded-2xl flex items-center gap-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <span style={{ fontSize: 32 }}>😔</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-red-300 text-base">You were outbid</p>
            <p className="text-red-400/60 text-xs mt-0.5">Better luck next time!</p>
          </div>
          <Link href="/dashboard" className="text-sm font-bold px-4 py-2 rounded-full shrink-0" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
            Dashboard →
          </Link>
          <button onClick={() => setLostNotif(false)} className="text-red-400/40 hover:text-red-400 text-xl leading-none">×</button>
        </div>
      )}

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
            <p className="font-mono text-sm">{hasLeader ? short(highestBidder as string) : "No bids yet"}</p>
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

        {/* Ended / Settled result */}
        {(stateNum === 3 || stateNum === 4) && (
          <div className={`p-4 rounded-xl border ${stateNum === 4 ? "bg-blue-950/40 border-blue-800/40" : "bg-green-950/40 border-green-800/40"}`}>
            <p className="text-xs text-white/40 mb-1">{stateNum === 4 ? "Auction settled" : "Auction ended — awaiting settlement"}</p>
            {hasLeader ? (
              <>
                <p className="font-semibold text-sm">
                  Winner: <span className="font-mono">{short(highestBidder as string)}</span>
                  {userAddress && (highestBidder as string).toLowerCase() === userAddress.toLowerCase() && (
                    <span className="ml-2 text-green-400 font-bold">← You won! 🎉</span>
                  )}
                </p>
                <p className="text-white/60 text-sm">
                  Winning bid: {formattedHighest} {(tokenSymbol as string) ?? "tokens"}
                </p>
              </>
            ) : (
              <p className="text-white/50 text-sm">No bids — auction ended with no winner</p>
            )}
          </div>
        )}

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
                    {isApprovePending ? "Approving…" : "1. Approve"}
                  </button>
                ) : (
                  <button
                    onClick={handleBid}
                    disabled={isPending || !bidAmount}
                    className="w-full bg-white text-black font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-white/90 transition-colors"
                  >
                    {isBidPending ? "Placing bid…" : "2. Place Bid"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Auto-bid agent */}
        {isActive && (
          <div className="space-y-3 p-4 border border-white/10 rounded-xl bg-white/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Auto-bid Agent</p>
                <p className="text-xs text-white/40 mt-1">
                  Runs from the server agent wallet{agentAddress ? ` ${short(agentAddress)}` : ""} and automatically chases the lead up to your limit.
                </p>
              </div>
              <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${isAgentEnabled ? "bg-green-950 text-green-300" : "bg-zinc-900 text-zinc-400"}`}>
                {isAgentEnabled ? "LIVE" : agentReady ? "READY" : "OFFLINE"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-white/40">Max bid</span>
                <input
                  type="number"
                  value={agentMaxBid}
                  onChange={(e) => setAgentMaxBid(e.target.value)}
                  placeholder={minBidFormatted ?? "0"}
                  className="w-full bg-black/30 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-white/40">Raise by</span>
                <input
                  type="number"
                  value={agentIncrement}
                  onChange={(e) => setAgentIncrement(e.target.value)}
                  placeholder={minIncrement ? formatUnits(minIncrement as bigint, decimals) : "0"}
                  className="w-full bg-black/30 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-white/40">Cooldown (sec)</span>
                <input
                  type="number"
                  min="1"
                  value={agentCooldown}
                  onChange={(e) => setAgentCooldown(e.target.value)}
                  className="w-full bg-black/30 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                />
              </label>
            </div>

            {agentError && (
              <p className="text-sm text-red-300">{agentError}</p>
            )}

            {!agentReady && (
              <p className="text-sm text-yellow-300">
                Agent is unavailable on the server. Set a valid `AGENT_PRIVATE_KEY` and restart the server.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleEnableAgent}
                disabled={!agentReady || agentBusy || !agentMaxBid || !agentIncrement}
                className="flex-1 bg-cyan-300 text-black font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-cyan-200 transition-colors"
              >
                {agentBusy && !isAgentEnabled ? "Enabling…" : isAgentEnabled ? "Update Auto-Bid" : "Enable Auto-Bid"}
              </button>
              {isAgentEnabled && (
                <button
                  onClick={handleDisableAgent}
                  disabled={agentBusy}
                  className="px-4 py-3 rounded-xl border border-white/20 text-white/80 font-semibold disabled:opacity-40 hover:border-white/40"
                >
                  {agentBusy ? "Stopping…" : "Disable"}
                </button>
              )}
            </div>
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
