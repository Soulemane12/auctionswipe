"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContracts, useReadContract } from "wagmi";
import { parseAbi } from "viem";

const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD ?? "") as `0x${string}`;

const factoryAbi = parseAbi([
  "function getAuctions(uint256 offset, uint256 limit) external view returns (address[])",
  "function nextId() external view returns (uint256)",
]);

const auctionAbi = parseAbi([
  "function metadataURI() external view returns (string)",
  "function imageURI() external view returns (string)",
  "function seller() external view returns (address)",
  "function currency() external view returns (address)",
]);

export default function SwipeFeed() {
  const { data: nextId } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "nextId",
    query: { enabled: !!FACTORY_ADDRESS },
  });

  const { data: addresses } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getAuctions",
    args: [0n, nextId ?? 0n],
    query: { enabled: !!FACTORY_ADDRESS && !!nextId && nextId > 0n },
  });

  const addrList = (addresses as `0x${string}`[] | undefined) ?? [];

  const { data: metaResults } = useReadContracts({
    contracts: addrList.flatMap((addr) => [
      { address: addr, abi: auctionAbi, functionName: "metadataURI" as const },
      { address: addr, abi: auctionAbi, functionName: "imageURI" as const },
      { address: addr, abi: auctionAbi, functionName: "seller" as const },
    ]),
    query: { enabled: addrList.length > 0 },
  });

  const auctions = addrList.map((addr, i) => ({
    address:     addr,
    auctionId:   String(i),
    metadataURI: (metaResults?.[i * 3]?.result as string) ?? "",
    imageURI:    (metaResults?.[i * 3 + 1]?.result as string) ?? "",
    seller:      (metaResults?.[i * 3 + 2]?.result as string) ?? "",
  }));

  return (
    <div className="relative">
      {/* Nav */}
      <div className="fixed top-4 right-4 z-50">
        <ConnectButton />
      </div>
      <Link
        href="/soulemane"
        className="fixed top-4 left-4 z-50 text-xs text-white/40 hover:text-white/80 transition-colors"
      >
        admin
      </Link>

      {/* Swipe feed */}
      <div className="h-screen overflow-y-scroll snap-y snap-mandatory">
        {auctions.length === 0 ? (
          <div className="h-screen snap-start flex flex-col items-center justify-center gap-4 bg-black">
            <p className="text-4xl">{FACTORY_ADDRESS ? "⏳" : "🔒"}</p>
            <p className="text-white/40 text-lg">{FACTORY_ADDRESS ? "Loading auctions…" : "No auctions yet"}</p>
          </div>
        ) : (
          auctions.map((a) => <AuctionCard key={a.address} auction={a} />)
        )}
      </div>
    </div>
  );
}

function AuctionCard({ auction }: { auction: { address: string; auctionId: string; metadataURI: string; imageURI: string; seller: string } }) {
  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  return (
    <div className="h-screen snap-start relative flex flex-col justify-end overflow-hidden bg-zinc-900">
      {auction.imageURI && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={auction.imageURI}
          alt={auction.metadataURI}
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Card content */}
      <div className="relative z-10 p-6 pb-10">
        <p className="text-white/50 text-xs font-mono mb-1">#{auction.auctionId}</p>
        <h2 className="text-white text-2xl font-bold mb-1 truncate">
          {auction.metadataURI || "Untitled Auction"}
        </h2>
        <p className="text-white/50 text-sm mb-6">{shortAddr(auction.seller)}</p>

        <Link
          href={`/auction/${auction.address}`}
          className="inline-block bg-white text-black font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-colors"
        >
          View Auction →
        </Link>
      </div>
    </div>
  );
}
