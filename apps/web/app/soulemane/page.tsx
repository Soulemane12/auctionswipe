"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseAbi } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

const ADMIN_ADDRESS = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "").toLowerCase();
const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD ?? "") as `0x${string}`;

const factoryAbi = parseAbi([
  "function getAuctions(uint256 offset, uint256 limit) external view returns (address[])",
  "function nextId() external view returns (uint256)",
]);

const auctionAbi = parseAbi([
  "function activate() external",
  "function pause() external",
  "function unpause() external",
  "function settle() external",
  "function end() external",
  "function currentState() view returns (uint8)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function highestBidder() view returns (address)",
  "function highestBid() view returns (uint256)",
]);

const STATE_LABELS = ["🔒 LOCKED", "⏳ COUNTDOWN", "🔥 ACTIVE", "✅ ENDED", "💸 SETTLED"];

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const [manualAddr, setManualAddr] = useState("");
  const [extra, setExtra] = useState<string[]>([]);

  const isAdmin = isConnected && address?.toLowerCase() === ADMIN_ADDRESS;

  // Read total auction count from factory
  const { data: nextId } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "nextId",
    query: { enabled: !!FACTORY_ADDRESS },
  });

  // Read all auction addresses from factory
  const { data: onChainAddresses } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getAuctions",
    args: [0n, nextId ?? 0n],
    query: { enabled: !!FACTORY_ADDRESS && !!nextId && nextId > 0n },
  });

  const chainList = (onChainAddresses as `0x${string}`[] | undefined) ?? [];
  const auctions = [...chainList, ...extra.filter((a) => !chainList.includes(a as `0x${string}`))];

  const addManual = () => {
    const addr = manualAddr.trim();
    if (!addr.startsWith("0x") || addr.length !== 42) return;
    if (!auctions.includes(addr)) setExtra((prev) => [addr, ...prev]);
    setManualAddr("");
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <p className="text-white/60">Connect wallet to access admin panel</p>
        <ConnectButton />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3">
        <p className="text-white/60 text-lg">Not authorized</p>
        <p className="text-white/30 text-sm font-mono">{address}</p>
        <Link href="/" className="text-white/50 hover:text-white text-sm mt-4">← Back to feed</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <Link href="/" className="text-white/50 hover:text-white text-sm">← Feed</Link>
        </div>

        {/* Manual address entry */}
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Paste auction contract address (0x…)"
            value={manualAddr}
            onChange={(e) => setManualAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 font-mono text-sm focus:outline-none focus:border-white/50"
          />
          <button
            onClick={addManual}
            className="bg-white text-black font-semibold px-4 py-3 rounded-xl hover:bg-white/90 transition-colors"
          >
            Add
          </button>
        </div>

        {auctions.length === 0 ? (
          <p className="text-white/40 text-sm">
            {FACTORY_ADDRESS ? "Loading auctions from chain…" : "No factory address set. Deploy contracts first."}
          </p>
        ) : (
          <div className="space-y-4">
            {auctions.map((addr) => (
              <AuctionControl key={addr} address={addr as `0x${string}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuctionControl({ address }: { address: `0x${string}` }) {
  const { writeContract, isPending } = useWriteContract();
  const [countdown, setCountdown] = useState<number | null>(null);

  const { data: state, refetch: refetchState } = useReadContract({
    address,
    abi: auctionAbi,
    functionName: "currentState",
  });

  const { data: startTime } = useReadContract({
    address,
    abi: auctionAbi,
    functionName: "startTime",
  });

  const { data: highestBidder } = useReadContract({
    address,
    abi: auctionAbi,
    functionName: "highestBidder",
  });

  const { data: highestBid } = useReadContract({
    address,
    abi: auctionAbi,
    functionName: "highestBid",
  });

  // Countdown timer for COUNTDOWN state
  useEffect(() => {
    if (state !== 1 || !startTime) return;
    const tick = () => {
      const secs = Number(startTime) - Math.floor(Date.now() / 1000);
      setCountdown(secs > 0 ? secs : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, startTime]);

  const stateNum = state !== undefined ? Number(state) : -1;
  const stateLabel = stateNum >= 0 ? STATE_LABELS[stateNum] : "…";

  const call = (fn: "activate" | "pause" | "unpause" | "settle" | "end") => {
    writeContract({ address, abi: auctionAbi, functionName: fn });
    setTimeout(() => refetchState(), 3000);
  };

  return (
    <div className="border border-white/10 rounded-xl p-5 bg-white/5">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-xs text-white/50">
          {address.slice(0, 10)}…{address.slice(-6)}
        </span>
        <span className="text-sm font-semibold">{stateLabel}</span>
      </div>

      {/* Countdown display */}
      {stateNum === 1 && countdown !== null && (
        <div className="mb-4 text-center">
          <p className="text-white/50 text-xs mb-1">starts in</p>
          <p className="text-4xl font-mono font-bold">
            {String(Math.floor(countdown / 60)).padStart(2, "0")}:
            {String(countdown % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* Winner info for ENDED/SETTLED */}
      {(stateNum === 3 || stateNum === 4) && highestBidder && (
        <div className="mb-4 text-sm text-white/60">
          <span>Winner: </span>
          <span className="font-mono">{(highestBidder as string).slice(0, 10)}…</span>
          {highestBid && (
            <span className="ml-2">— {(Number(highestBid) / 1e18).toFixed(4)} tokens</span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        {stateNum === 0 && (
          <button
            onClick={() => call("activate")}
            disabled={isPending}
            className="bg-green-500 text-black px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40"
          >
            {isPending ? "…" : "Activate"}
          </button>
        )}
        {stateNum === 3 && (
          <>
            <button
              onClick={() => call("end")}
              disabled={isPending}
              className="bg-white/20 text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "…" : "End"}
            </button>
            <button
              onClick={() => call("settle")}
              disabled={isPending}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40"
            >
              {isPending ? "…" : "Settle"}
            </button>
          </>
        )}
        {(stateNum === 1 || stateNum === 2) && (
          <button
            onClick={() => call("pause")}
            disabled={isPending}
            className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40"
          >
            {isPending ? "…" : "Pause"}
          </button>
        )}
      </div>
    </div>
  );
}
