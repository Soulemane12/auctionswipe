"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { socket } from "@/lib/socket";

interface AuctionRecord {
  address: string;
  auctionId: string;
  seller: string;
  currency: string;
  metadataURI: string;
  imageURI: string;
}

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

export default function SwipeFeed() {
  const [auctions, setAuctions] = useState<AuctionRecord[]>([]);

  useEffect(() => {
    fetch(`${SERVER_URL}/auctions`)
      .then((r) => r.json())
      .then(setAuctions)
      .catch(() => {
        // Server not running yet — page stays in empty state
      });

    socket.on("AuctionCreated", (args: Record<string, unknown>) => {
      setAuctions((prev) => [
        ...prev,
        {
          address:     args.auction as string,
          auctionId:   String(args.auctionId ?? ""),
          seller:      args.seller as string,
          currency:    args.currency as string,
          metadataURI: args.metadataURI as string,
          imageURI:    args.imageURI as string,
        },
      ]);
    });

    return () => { socket.off("AuctionCreated"); };
  }, []);

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
            <p className="text-4xl">🔒</p>
            <p className="text-white/40 text-lg">No auctions yet</p>
          </div>
        ) : (
          auctions.map((a) => <AuctionCard key={a.address} auction={a} />)
        )}
      </div>
    </div>
  );
}

function AuctionCard({ auction }: { auction: AuctionRecord }) {
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
