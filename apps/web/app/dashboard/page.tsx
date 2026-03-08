"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { socket } from "@/lib/socket";
import { getAllBiddedAuctions } from "@/lib/history";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const auctionAbi = parseAbi([
  "function metadataURI() view returns (string)",
  "function imageURI() view returns (string)",
  "function currentState() view returns (uint8)",
  "function highestBid() view returns (uint256)",
  "function highestBidder() view returns (address)",
]);

type Tab = "bids" | "won" | "agent";

interface DuneBidRow { auction: string; amount_tokens: number; block_time: string; }
interface DuneWonRow  { auction: string; payout_tokens: number; block_time: string; }
interface AgentPolicy { auctionAddress: string; maxBid: string; increment: string; cooldownMs: number; }
interface OutbidToast { id: number; auction: string; amount: string; }

const FONT = "system-ui,-apple-system,sans-serif";
const BG   = "#000";
const BORDER = "1px solid #2f3336";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const [tab, setTab]             = useState<Tab>("bids");
  const [toasts, setToasts]       = useState<OutbidToast[]>([]);
  const [duneBids, setDuneBids]   = useState<DuneBidRow[]>([]);
  const [duneWon]                 = useState<DuneWonRow[]>([]);
  const [duneFallback, setDuneFallback] = useState(false);
  const [duneLoadedFor, setDuneLoadedFor] = useState<string | null>(null);
  const [policies, setPolicies]         = useState<Record<string, AgentPolicy> | null>(null);
  // Track the known leader per auction; only show outbid toast when user is knocked off top
  const leaderRef = useRef<Record<string, string>>({});
  const localAuctions = getAllBiddedAuctions(address);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch(`/api/dune/user?address=${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDuneFallback(!!d.fallback);
        setDuneBids(d.rows ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setDuneFallback(true);
      })
      .finally(() => {
        if (cancelled) return;
        setDuneLoadedFor(address);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (tab !== "agent" || policies !== null) return;
    let cancelled = false;
    fetch(`${WS_URL}/agent`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPolicies(d ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setPolicies({});
      });
    return () => {
      cancelled = true;
    };
  }, [tab, policies]);

  useEffect(() => {
    if (!address || localAuctions.length === 0) return;
    localAuctions.forEach((addr) => socket.emit("join:auction", addr));
    socket.on("leader:changed", (e: { auctionAddress: string; leader: string; amount: string }) => {
      const auctionAddr = e.auctionAddress?.toLowerCase();
      const newLeader   = e.leader?.toLowerCase();
      const userAddr    = address.toLowerCase();

      // Track who's leading so we know if the user was knocked off
      const wasLeading = leaderRef.current[auctionAddr] === userAddr;
      leaderRef.current[auctionAddr] = newLeader;

      if (newLeader === userAddr) return;               // user is now leading — no toast
      if (!localAuctions.includes(auctionAddr)) return; // not an auction user bid on
      if (!wasLeading) return;                          // user wasn't leading — not an outbid

      const toast = { id: Date.now(), auction: e.auctionAddress, amount: e.amount };
      setToasts((p) => [toast, ...p].slice(0, 5));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 8000);
    });
    return () => {
      localAuctions.forEach((addr) => socket.emit("leave:auction", addr));
      socket.off("leader:changed");
    };
  }, [address, localAuctions]);

  if (!isConnected) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, fontFamily: FONT }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #1d9bf0, #7856ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, boxShadow: "0 0 40px rgba(29,155,240,0.3)" }}>
          👤
        </div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: 0 }}>Connect to view your dashboard</p>
        <ConnectButton />
        <Link href="/" style={{ color: "#1d9bf0", textDecoration: "none", fontSize: 13, marginTop: 4 }}>← Back to feed</Link>
      </div>
    );
  }

  const duneAddrs  = duneBids.map((r) => r.auction?.toLowerCase()).filter(Boolean);
  const allAuctions = [...new Set([...duneAddrs, ...localAuctions])];
  const duneLoading = !!address && duneLoadedFor !== address;
  const agentLoading = tab === "agent" && policies === null;
  const botCount    = Object.keys(policies ?? {}).length;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#fff", fontFamily: FONT }}>
      {/* Outbid toasts — fixed */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 72, right: 16, zIndex: 200, display: "flex", flexDirection: "column", gap: 8, width: 300 }}>
          {toasts.map((t) => (
            <div key={t.id} style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 16, padding: "12px 14px", backdropFilter: "blur(20px)",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 8px 32px rgba(239,68,68,0.2)",
              animation: "slideIn 0.2s ease",
            }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#f87171", margin: 0 }}>You&apos;ve been outbid!</p>
                <p style={{ fontSize: 11, color: "rgba(248,113,113,0.65)", margin: "2px 0 0", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.auction.slice(0, 10)}… · {(Number(t.amount) / 1e18).toFixed(2)} tkn
                </p>
              </div>
              <Link href={`/auction/${t.auction}`} style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>Bid →</Link>
              <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
                style={{ color: "rgba(248,113,113,0.4)", background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 600, margin: "0 auto", borderLeft: BORDER, borderRight: BORDER, minHeight: "100vh" }}>

        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)",
          borderBottom: BORDER, padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: "50%",
              color: "white", textDecoration: "none", fontSize: 18,
              background: "rgba(255,255,255,0.06)", border: BORDER,
            }}>←</Link>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Dashboard</h1>
              <p style={{ fontSize: 11, color: "#536471", fontFamily: "monospace", margin: 0 }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
            </div>
          </div>
          <ConnectButton showBalance={false} />
        </div>

        {/* Profile banner */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #1d9bf0 0%, #7856ff 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 800, color: "#fff",
              border: "3px solid rgba(29,155,240,0.4)",
              boxShadow: "0 0 24px rgba(29,155,240,0.2)",
            }}>
              {address?.slice(2, 4).toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight: 800, fontSize: 16, margin: "0 0 2px" }}>
                {address?.slice(0, 8)}…{address?.slice(-6)}
              </p>
              <p style={{ fontSize: 12, color: "#536471", margin: 0 }}>AuctionSwipe</p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 0, borderTop: BORDER, paddingTop: 14, paddingBottom: 16 }}>
            {[
              { n: allAuctions.length, label: "Bids placed" },
              { n: duneWon.length,     label: "Auctions won" },
              { n: botCount,           label: "Active bots" },
            ].map(({ n, label }, i) => (
              <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : i === 2 ? "right" : "center" }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{n}</span>
                <span style={{ color: "#536471", fontSize: 13, marginLeft: 4 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: BORDER, borderTop: BORDER }}>
          {([
            { key: "bids" as Tab,  label: "My Bids", icon: "🏷️" },
            { key: "won" as Tab,   label: "Won",      icon: "🏆" },
            { key: "agent" as Tab, label: "Bots",     icon: "🤖" },
          ]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: "14px 0",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? "#fff" : "#536471",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              position: "relative", transition: "color 0.15s",
            }}>
              <span style={{ fontSize: 17 }}>{icon}</span>
              <span>{label}</span>
              {tab === key && (
                <span style={{
                  position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                  width: 48, height: 3, background: "#1d9bf0", borderRadius: "3px 3px 0 0",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "bids"  && <BidsTab  address={address!} duneBids={duneBids} duneFallback={duneFallback} duneLoading={duneLoading} allAuctions={allAuctions} />}
        {tab === "won"   && <WonTab   duneWon={duneWon} duneFallback={duneFallback} duneLoading={duneLoading} />}
        {tab === "agent" && <AgentTab policies={policies ?? {}} loading={agentLoading} />}
      </div>
    </div>
  );
}

// ── Bids Tab ──────────────────────────────────────────────────────────────────

function BidsTab({ address, duneBids, duneFallback, duneLoading, allAuctions }: {
  address:      string;
  duneBids:     DuneBidRow[];
  duneFallback: boolean;
  duneLoading:  boolean;
  allAuctions:  string[];
}) {
  if (duneLoading) return <Skeleton count={3} />;

  if (allAuctions.length === 0) {
    return (
      <EmptyState icon="🏷️" title="No bids yet" subtitle="Place a bid on any auction to see it here" />
    );
  }

  return (
    <div>
      {duneFallback && (
        <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "rgba(29,155,240,0.06)", border: "1px solid rgba(29,155,240,0.15)", borderRadius: 12 }}>
          <p style={{ color: "#536471", fontSize: 12, margin: 0 }}>
            Showing local bids — Dune Analytics will add on-chain history once AuctionMetrics is live
          </p>
        </div>
      )}
      <div style={{ borderTop: "none" }}>
        {allAuctions.map((addr) => (
          <BidCard key={addr} auctionAddress={addr} userAddress={address} duneBids={duneBids} />
        ))}
      </div>
    </div>
  );
}

function BidCard({ auctionAddress, userAddress, duneBids }: {
  auctionAddress: string;
  userAddress:    string;
  duneBids:       DuneBidRow[];
}) {
  const addr = auctionAddress as `0x${string}`;
  const { data: title }         = useReadContract({ address: addr, abi: auctionAbi, functionName: "metadataURI" });
  const { data: imageURI }      = useReadContract({ address: addr, abi: auctionAbi, functionName: "imageURI" });
  const { data: state }         = useReadContract({ address: addr, abi: auctionAbi, functionName: "currentState" });
  const { data: highestBid }    = useReadContract({ address: addr, abi: auctionAbi, functionName: "highestBid" });
  const { data: highestBidder } = useReadContract({ address: addr, abi: auctionAbi, functionName: "highestBidder" });

  const stateNum  = state !== undefined ? Number(state) : -1;
  const highestBidRaw = highestBid as bigint | undefined;
  const hasLiveBid = !!highestBidder && (highestBidder as string).toLowerCase() !== ZERO_ADDRESS && highestBidRaw !== undefined && highestBidRaw > 0n;
  const isLeading = hasLiveBid && (highestBidder as string)?.toLowerCase() === userAddress.toLowerCase();
  const duneRow   = duneBids.find((r) => r.auction?.toLowerCase() === auctionAddress.toLowerCase());

  const STATE_LABELS: Record<number, string> = { 0: "Locked", 1: "Countdown", 2: "Live", 3: "Ended", 4: "Settled" };
  const STATE_COLORS: Record<number, string> = { 0: "#71767b", 1: "#f4b400", 2: "#00e676", 3: "#448aff", 4: "#e040fb" };
  const stateColor = STATE_COLORS[stateNum] ?? "#71767b";

  return (
    <div style={{
      display: "flex", gap: 12, padding: "14px 16px",
      borderBottom: "1px solid #2f3336",
      transition: "background 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Thumbnail */}
      <div style={{
        width: 56, height: 56, borderRadius: 12, flexShrink: 0, overflow: "hidden",
        background: "#1e2028", border: "1px solid #2f3336",
      }}>
        {imageURI ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageURI as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1d9bf020, #7856ff20)" }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(title as string) || "Untitled"}
          </span>
          {stateNum >= 0 && (
            <span style={{
              padding: "2px 8px", borderRadius: 50, fontSize: 10, fontWeight: 700,
              color: stateColor, background: `${stateColor}15`,
              border: `1px solid ${stateColor}30`, flexShrink: 0,
            }}>
              {STATE_LABELS[stateNum] ?? "…"}
            </span>
          )}
        </div>
        <p style={{ color: "#536471", fontSize: 11, fontFamily: "monospace", margin: "0 0 8px" }}>
          {auctionAddress.slice(0, 8)}…{auctionAddress.slice(-4)}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {highestBid !== undefined && (
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: !hasLiveBid ? "#9ca3af" : isLeading ? "#00e676" : "#f87171",
              padding: "3px 10px", borderRadius: 50,
              background: !hasLiveBid ? "rgba(156,163,175,0.1)" : isLeading ? "rgba(0,230,118,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${!hasLiveBid ? "rgba(156,163,175,0.25)" : isLeading ? "rgba(0,230,118,0.25)" : "rgba(248,113,113,0.25)"}`,
            }}>
              {!hasLiveBid ? "No bids yet" : isLeading ? "Leading" : "Outbid"}{hasLiveBid ? ` · ${(Number(highestBid) / 1e18).toFixed(2)} tkn` : ""}
            </span>
          )}
          {duneRow && (
            <span style={{ color: "#536471", fontSize: 11 }}>
              Your bid: {duneRow.amount_tokens?.toFixed(2)} tkn
            </span>
          )}
        </div>
      </div>

      <Link href={`/auction/${auctionAddress}`} style={{
        alignSelf: "center", color: "#1d9bf0", fontSize: 12, fontWeight: 600,
        textDecoration: "none", flexShrink: 0,
        padding: "6px 14px", borderRadius: 50,
        border: "1px solid rgba(29,155,240,0.3)",
        background: "rgba(29,155,240,0.07)",
      }}>
        {stateNum === 2 ? "Bid →" : "View →"}
      </Link>
    </div>
  );
}

// ── Won Tab ───────────────────────────────────────────────────────────────────

function WonTab({ duneWon, duneFallback, duneLoading }: {
  duneWon:      DuneWonRow[];
  duneFallback: boolean;
  duneLoading:  boolean;
}) {
  if (duneLoading) return <Skeleton count={2} />;

  if (duneFallback) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          background: "rgba(224,64,251,0.06)", border: "1px solid rgba(224,64,251,0.2)",
          borderRadius: 16, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
          <p style={{ color: "#ccc", fontSize: 14, margin: "0 0 6px", fontWeight: 600 }}>Won items tracked via Dune Analytics</p>
          <p style={{ color: "#536471", fontSize: 12, margin: 0 }}>Available once AuctionMetrics contract is deployed</p>
        </div>
      </div>
    );
  }

  if (duneWon.length === 0) {
    return <EmptyState icon="🏆" title="No wins yet" subtitle="Win an auction to see your items here" />;
  }

  return (
    <div>
      {duneWon.map((row, i) => (
        <div key={i} style={{
          display: "flex", gap: 12, padding: "14px 16px",
          borderBottom: "1px solid #2f3336",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #f4b40020, #e040fb20)",
            border: "2px solid rgba(244,180,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>
            🏆
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace", margin: "0 0 4px", color: "#fff" }}>
              {row.auction?.slice(0, 10)}…{row.auction?.slice(-4)}
            </p>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#00e676", margin: "0 0 4px" }}>
              Won for {row.payout_tokens?.toFixed(2)} tokens
            </p>
            {row.block_time && (
              <p style={{ color: "#536471", fontSize: 11, margin: 0 }}>
                {new Date(row.block_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <Link href={`/auction/${row.auction}`} style={{
            alignSelf: "center", color: "#1d9bf0", fontSize: 12, fontWeight: 600,
            textDecoration: "none", flexShrink: 0,
            padding: "6px 14px", borderRadius: 50,
            border: "1px solid rgba(29,155,240,0.3)",
          }}>
            View →
          </Link>
        </div>
      ))}
    </div>
  );
}

// ── Agent Tab ─────────────────────────────────────────────────────────────────

function AgentTab({ policies, loading }: { policies: Record<string, AgentPolicy>; loading: boolean }) {
  const entries = Object.entries(policies);
  if (loading) return <Skeleton count={2} />;

  if (entries.length === 0) {
    return <EmptyState icon="🤖" title="No active bots" subtitle="Set up an auto-bid agent from any auction page" />;
  }

  return (
    <div>
      {entries.map(([auctionAddr, policy]) => (
        <div key={auctionAddr} style={{
          padding: "16px 16px",
          borderBottom: "1px solid #2f3336",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(0,230,118,0.1)", border: "2px solid rgba(0,230,118,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>
                🤖
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>Auto-bid active</p>
                <p style={{ color: "#536471", fontSize: 11, fontFamily: "monospace", margin: 0 }}>
                  {auctionAddr.slice(0, 10)}…{auctionAddr.slice(-4)}
                </p>
              </div>
            </div>
            <span style={{
              padding: "4px 12px", borderRadius: 50,
              background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)",
              color: "#00e676", fontSize: 11, fontWeight: 700,
            }}>
              ● Live
            </span>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[
              { label: "Max bid", value: `${(Number(policy.maxBid) / 1e18).toFixed(0)} tkn` },
              { label: "Increment", value: `${(Number(policy.increment) / 1e18).toFixed(0)} tkn` },
              { label: "Cooldown", value: `${policy.cooldownMs / 1000}s` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "#111", border: "1px solid #2f3336",
                borderRadius: 12, padding: "10px", textAlign: "center",
              }}>
                <p style={{ color: "#536471", fontSize: 10, margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
                <p style={{ color: "#fff", fontSize: 14, fontWeight: 800, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          <Link href={`/auction/${auctionAddr}`} style={{
            color: "#1d9bf0", fontSize: 13, textDecoration: "none", fontWeight: 600,
          }}>
            View auction →
          </Link>
        </div>
      ))}
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Skeleton({ count }: { count: number }) {
  return (
    <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 72, borderRadius: 14,
          background: "linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s infinite",
          border: "1px solid #2f3336",
        }} />
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12 }}>
      <span style={{ fontSize: 48 }}>{icon}</span>
      <p style={{ fontWeight: 800, fontSize: 18, margin: 0, color: "#fff" }}>{title}</p>
      <p style={{ color: "#536471", fontSize: 14, margin: 0, textAlign: "center" }}>{subtitle}</p>
      <Link href="/" style={{ color: "#1d9bf0", textDecoration: "none", fontSize: 14, marginTop: 8, fontWeight: 600 }}>
        Browse auctions →
      </Link>
    </div>
  );
}
