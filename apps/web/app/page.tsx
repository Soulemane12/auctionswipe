"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContracts, useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { useEffect, useState } from "react";

const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD ?? "") as `0x${string}`;

const factoryAbi = parseAbi([
  "function getAuctions(uint256 offset, uint256 limit) external view returns (address[])",
  "function nextId() external view returns (uint256)",
]);

const auctionAbi = parseAbi([
  "function metadataURI() external view returns (string)",
  "function imageURI() external view returns (string)",
  "function seller() external view returns (address)",
  "function currentState() external view returns (uint8)",
  "function highestBid() external view returns (uint256)",
  "function endTime() external view returns (uint256)",
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

  const addrList = ((addresses as `0x${string}`[] | undefined) ?? []).slice().reverse();

  const { data: metaResults } = useReadContracts({
    contracts: addrList.flatMap((addr) => [
      { address: addr, abi: auctionAbi, functionName: "metadataURI" as const },
      { address: addr, abi: auctionAbi, functionName: "imageURI" as const },
      { address: addr, abi: auctionAbi, functionName: "seller" as const },
      { address: addr, abi: auctionAbi, functionName: "currentState" as const },
      { address: addr, abi: auctionAbi, functionName: "highestBid" as const },
      { address: addr, abi: auctionAbi, functionName: "endTime" as const },
    ]),
    query: { enabled: addrList.length > 0 },
  });

  const auctions = addrList.map((addr, i) => ({
    address:    addr,
    title:      (metaResults?.[i * 6]?.result as string) ?? "",
    imageURI:   (metaResults?.[i * 6 + 1]?.result as string) ?? "",
    seller:     (metaResults?.[i * 6 + 2]?.result as string) ?? "",
    state:      metaResults?.[i * 6 + 3]?.result !== undefined ? Number(metaResults[i * 6 + 3].result) : -1,
    highestBid: metaResults?.[i * 6 + 4]?.result !== undefined ? Number(metaResults[i * 6 + 4].result) : 0,
    endTime:    metaResults?.[i * 6 + 5]?.result !== undefined ? Number(metaResults[i * 6 + 5].result) : 0,
  })).filter(a => {
    if (a.state === -1 || a.state === 0) return false; // hide unloaded and LOCKED auctions from public feed
    if (a.state === 3 || a.state === 4) return false; // ENDED or SETTLED
    if (a.state === 2 && a.endTime > 0 && Date.now() / 1000 > a.endTime) return false; // time passed
    return true;
  });

  return (
    <div style={{ background: "#000", color: "#fff", fontFamily: "-apple-system,'Helvetica Neue',Arial,sans-serif", WebkitFontSmoothing: "antialiased" }}>

      {/* ── TikTok header ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px",
        background: "linear-gradient(180deg,rgba(0,0,0,0.55) 0%,transparent 100%)",
        pointerEvents: "none",
      }}>
        {/* Live indicator / search */}
        <div style={{ pointerEvents: "auto" }}>
          <Link href="/admin" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
            textDecoration: "none",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </Link>
        </div>

        {/* Center tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 22, pointerEvents: "auto" }}>
          <Link href="/dashboard" style={{
            color: "rgba(255,255,255,0.55)", fontSize: 15, fontWeight: 600,
            textDecoration: "none", letterSpacing: "-0.2px",
          }}>
            Users
          </Link>

          <div style={{ position: "relative", textAlign: "center" }}>
            <span style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px" }}>For You</span>
            <div style={{
              position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
              width: 22, height: 2.5, background: "#fff", borderRadius: 2,
            }} />
          </div>

          <Link href="/admin" style={{
            color: "rgba(255,255,255,0.55)", fontSize: 15, fontWeight: 600,
            textDecoration: "none", letterSpacing: "-0.2px",
          }}>
            Admin
          </Link>
        </div>

        {/* Right */}
        <div style={{ pointerEvents: "auto" }}>
          <ConnectButton showBalance={false} />
        </div>
      </header>

      {/* ── Snap scroll feed ── */}
      <div style={{ height: "100dvh", overflowY: "scroll", scrollSnapType: "y mandatory", scrollBehavior: "auto" }}>
        {auctions.length === 0 ? (
          <EmptySlide />
        ) : (
          auctions.map((a) => <AuctionSlide key={a.address} auction={a} />)
        )}
      </div>

      {/* ── TikTok bottom nav ── */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
        display: "flex", alignItems: "flex-end", justifyContent: "space-around",
        padding: "10px 8px 28px",
        background: "linear-gradient(0deg,rgba(0,0,0,0.75) 0%,transparent 100%)",
        pointerEvents: "none",
      }}>
        <BottomNavItem icon={<IconHome />} label="Home" active />
        <BottomNavItem icon={<IconDiscover />} label="Users" href="/dashboard" />

        {/* Center + button */}
        <div style={{ pointerEvents: "auto" }}>
          <Link href="/admin" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 46, height: 32, borderRadius: 9, textDecoration: "none",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: 9,
              background: "#20d5ec", transform: "translateX(-3px)",
            }} />
            <div style={{
              position: "absolute", inset: 0, borderRadius: 9,
              background: "#fe2c55", transform: "translateX(3px)",
            }} />
            <div style={{
              position: "relative", background: "#fff", borderRadius: 8,
              width: 42, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ color: "#000", fontSize: 22, fontWeight: 300, lineHeight: 1 }}>+</span>
            </div>
          </Link>
        </div>

        <BottomNavItem icon={<IconInbox />} label="Bids" href="/dashboard" />
        <BottomNavItem icon={<IconProfile />} label="Profile" href="/admin" />
      </nav>
    </div>
  );
}

// ── Slide ─────────────────────────────────────────────────────────────────────

function AuctionSlide({ auction }: {
  auction: { address: string; title: string; imageURI: string; seller: string; state: number; highestBid: number; endTime: number }
}) {
  const [countdown, setCountdown] = useState<string | null>(null);
  const isLive = auction.state === 2;

  useEffect(() => {
    if (auction.state !== 2 || !auction.endTime) return;
    const tick = () => {
      const secs = Math.max(0, auction.endTime - Math.floor(Date.now() / 1000));
      const m = String(Math.floor(secs / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      setCountdown(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [auction.state, auction.endTime]);

  const handle = `@${auction.seller?.slice(2, 8).toLowerCase()}…${auction.seller?.slice(-4)}`;
  const bid = auction.highestBid > 0 ? (auction.highestBid / 1e18).toFixed(2) : null;

  return (
    <div style={{
      height: "100dvh", scrollSnapAlign: "start",
      position: "relative", overflow: "hidden",
      background: "#111",
    }}>
      {/* Background image */}
      {auction.imageURI ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={auction.imageURI} alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover",
        }} />
      ) : (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg,#0d0d1a,#1a0a2e 45%,#0a1520)",
        }} />
      )}

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.25) 40%,rgba(0,0,0,0.08) 65%,rgba(0,0,0,0.4) 100%)",
      }} />

      {/* Live badge */}
      {isLive && (
        <div style={{
          position: "absolute", top: 70, left: 12,
          display: "flex", alignItems: "center", gap: 5,
          background: "#fe2c55", borderRadius: 4,
          padding: "3px 8px",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.5px" }}>LIVE</span>
        </div>
      )}

      {/* ── Right sidebar ── */}
      <div style={{
        position: "absolute", right: 10, bottom: 100,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        zIndex: 10,
      }}>
        {/* Seller avatar */}
        <div style={{ position: "relative", marginBottom: 4 }}>
          <div style={{
            width: 50, height: 50, borderRadius: "50%",
            background: "linear-gradient(135deg,#1d9bf0,#7856ff)",
            border: "2px solid #fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#fff",
          }}>
            {auction.seller?.slice(2, 4).toUpperCase() || "?"}
          </div>
          <div style={{
            position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
            width: 20, height: 20, borderRadius: "50%",
            background: "#fe2c55", border: "1.5px solid #000",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 300, color: "#fff", lineHeight: 1,
          }}>+</div>
        </div>

        {/* Bid/gavel */}
        <SidebarAction
          icon={<IconGavel />}
          label={bid ? bid : "0"}
          href={`/auction/${auction.address}`}
          highlight={isLive}
        />

        {/* Countdown timer */}
        <SidebarAction
          icon={<IconClock />}
          label={countdown ?? (auction.state === 4 ? "Done" : auction.state === 3 ? "Ended" : "—")}
        />

        {/* Share */}
        <SidebarAction icon={<IconShare />} label="Share" />

        {/* Music disc */}
        <MusicDisc />
      </div>

      {/* ── Bottom left info ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 76,
        padding: "0 14px 88px",
        zIndex: 10,
      }}>
        {/* Handle */}
        <p style={{
          fontSize: 15, fontWeight: 700, color: "#fff",
          marginBottom: 6, letterSpacing: "-0.2px",
          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
        }}>
          {handle}
        </p>

        {/* Title */}
        <p style={{
          fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.95)",
          marginBottom: 10, lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical", overflow: "hidden",
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}>
          {auction.title || "Untitled Auction"}
          {" "}
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
            #{auction.address.slice(2, 8)}
          </span>
        </p>

        {/* Music/sound bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.08)", borderRadius: 50,
          padding: "5px 12px", width: "fit-content",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500, letterSpacing: "0.1px" }}>
            AuctionSwipe · {auction.state === 2 ? "Live now" : auction.state === 4 ? "Settled" : auction.state === 3 ? "Ended" : auction.state === 1 ? "Starting soon" : "Locked"}
          </span>
        </div>

        {/* Bid CTA */}
        <Link href={`/auction/${auction.address}`} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          marginTop: 14, padding: "11px 24px", borderRadius: 50,
          background: isLive ? "#fe2c55" : "rgba(255,255,255,0.13)",
          border: isLive ? "none" : "1.5px solid rgba(255,255,255,0.2)",
          backdropFilter: !isLive ? "blur(12px)" : undefined,
          color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none",
          letterSpacing: "-0.2px",
          boxShadow: isLive ? "0 4px 20px rgba(254,44,85,0.45)" : undefined,
        }}>
          {isLive ? "Place Bid" : "View Auction"}
        </Link>
      </div>
    </div>
  );
}

// ── Sidebar action button ─────────────────────────────────────────────────────

function SidebarAction({ icon, label, href, highlight }: { icon: React.ReactNode; label: string; href?: string; highlight?: boolean }) {
  const content = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 50, height: 50, borderRadius: "50%",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        ...(highlight ? { background: "rgba(254,44,85,0.2)", border: "1px solid rgba(254,44,85,0.5)" } : {}),
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.1px" }}>
        {label}
      </span>
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{content}</Link>;
  return content;
}

// ── Spinning music disc (TikTok signature element) ────────────────────────────

function MusicDisc() {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: "50%",
      background: `conic-gradient(from 0deg, #1a1a1a, #333, #1a1a1a)`,
      border: "3px solid rgba(255,255,255,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
      animation: "spin 4s linear infinite",
    }}>
      {/* Record grooves */}
      <div style={{
        position: "absolute", inset: 3, borderRadius: "50%",
        background: "linear-gradient(135deg,#1d9bf0,#7856ff)",
        opacity: 0.6,
      }} />
      <div style={{
        position: "relative", zIndex: 1,
        width: 14, height: 14, borderRadius: "50%",
        background: "#000", border: "2px solid rgba(255,255,255,0.5)",
      }} />
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Bottom nav item ───────────────────────────────────────────────────────────

function BottomNavItem({ icon, label, active, href }: { icon: React.ReactNode; label: string; active?: boolean; href?: string }) {
  const content = (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "0 12px", cursor: "pointer",
    }}>
      <div style={{ opacity: active ? 1 : 0.55, filter: active ? "drop-shadow(0 0 6px rgba(255,255,255,0.4))" : undefined }}>
        {icon}
      </div>
      <span style={{
        fontSize: 10, fontWeight: active ? 700 : 500,
        color: active ? "#fff" : "rgba(255,255,255,0.55)",
        letterSpacing: "0.1px",
      }}>
        {label}
      </span>
    </div>
  );
  if (href) return (
    <Link href={href} style={{ textDecoration: "none", pointerEvents: "auto" }}>{content}</Link>
  );
  return <div style={{ pointerEvents: "auto" }}>{content}</div>;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptySlide() {
  return (
    <div style={{
      height: "100dvh", scrollSnapAlign: "start",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 16, background: "#000",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
      }}>🏷️</div>
      <p style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>No auctions yet</p>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>
        {FACTORY_ADDRESS ? "Check back soon" : "No factory configured"}
      </p>
      <Link href="/admin" style={{
        marginTop: 8, padding: "10px 24px", borderRadius: 50,
        background: "#fe2c55", color: "#fff", fontWeight: 700,
        fontSize: 14, textDecoration: "none",
        boxShadow: "0 4px 16px rgba(254,44,85,0.4)",
      }}>
        Create Listing
      </Link>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
  );
}

function IconDiscover() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function IconInbox() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconGavel() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M9.5 4L7 6.5l1.5 1.5L4 12.5 5.5 14l4.5-4.5 1.5 1.5L14 8.5 9.5 4zm4 11L12 16.5l3 3L19.5 15l-3-3L15 13.5l-1.5 1.5zM3 19h18v2H3z"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
    </svg>
  );
}
