"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { robinhoodTestnet, ROBINHOOD_RPC_URL } from "@/lib/wagmi";
import { normalizeWalletError } from "@/lib/walletError";

const ADMIN_ADDRESS   = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "").toLowerCase();
const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD ?? "") as `0x${string}`;
const TOKEN_ADDRESS   = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "") as `0x${string}`;

const factoryAbi = parseAbi([
  "function getAuctions(uint256 offset, uint256 limit) external view returns (address[])",
  "function nextId() external view returns (uint256)",
  "function createAuction(address currency, uint256 reservePrice, uint256 minIncrement, uint256 durationSeconds, string metadataURI, string imageURI, address admin) external returns (uint256 auctionId, address auction)",
]);

const auctionAbi = parseAbi([
  "function activate() external",
  "function pause() external",
  "function settle() external",
  "function end() external",
  "function currentState() view returns (uint8)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function highestBidder() view returns (address)",
  "function highestBid() view returns (uint256)",
  "function metadataURI() view returns (string)",
  "function imageURI() view returns (string)",
]);

const STATE_LABELS = ["LOCKED", "COUNTDOWN", "ACTIVE", "ENDED", "SETTLED"];
const STATE_COLORS = ["#71767b", "#f4b400", "#00e676", "#448aff", "#e040fb"];
const STATE_BG     = ["#71767b15", "#f4b40015", "#00e67615", "#448aff15", "#e040fb15"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SellerRow {
  auction:       string;
  payout_tokens: number;
  fee_tokens:    number;
  winner:        string;
  block_time:    string;
}

interface ListingPreset {
  id: string;
  title: string;
  imageUrl: string;
  reserve: string;
  increment: string;
  duration: string;
  category: string;
  priceTag: string;
}

const FONT   = "system-ui,-apple-system,sans-serif";
const BORDER = "1px solid #2f3336";
const CHAIN_ID = robinhoodTestnet.id;
const DEFAULT_ROBINHOOD_RPC = "https://rpc.testnet.chain.robinhood.com";
const DEFAULT_RESERVE = "10000";
const DEFAULT_INCREMENT = "1000";
const DEFAULT_DURATION = "180";
const DEMO_LISTINGS: ListingPreset[] = [
  {
    id: "iphone-16-pro",
    title: "iPhone 16 Pro Max · Desert Titanium",
    imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=1200&q=80",
    reserve: "12000",
    increment: "1000",
    duration: "180",
    category: "Tech",
    priceTag: "hot drop",
  },
  {
    id: "macbook-air",
    title: "MacBook Air 15-inch · Midnight",
    imageUrl: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
    reserve: "18000",
    increment: "1500",
    duration: "240",
    category: "Laptop",
    priceTag: "creator pick",
  },
  {
    id: "sony-headphones",
    title: "Sony WH-1000XM5 Noise Cancelling Headphones",
    imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1200&q=80",
    reserve: "7000",
    increment: "500",
    duration: "180",
    category: "Audio",
    priceTag: "best seller",
  },
  {
    id: "playstation-5",
    title: "PlayStation 5 Slim Bundle",
    imageUrl: "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1200&q=80",
    reserve: "11000",
    increment: "1000",
    duration: "240",
    category: "Gaming",
    priceTag: "live demand",
  },
  {
    id: "nike-dunks",
    title: "Nike Dunk Low Panda",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    reserve: "6500",
    increment: "500",
    duration: "180",
    category: "Sneakers",
    priceTag: "streetwear",
  },
  {
    id: "dyson-airwrap",
    title: "Dyson Airwrap Multi-Styler",
    imageUrl: "https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=1200&q=80",
    reserve: "9500",
    increment: "750",
    duration: "180",
    category: "Beauty",
    priceTag: "premium",
  },
  {
    id: "leica-camera",
    title: "Leica Q3 Compact Camera",
    imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    reserve: "22000",
    increment: "2000",
    duration: "300",
    category: "Camera",
    priceTag: "rare gear",
  },
  {
    id: "gaming-chair",
    title: "Racing Style Gaming Chair",
    imageUrl: "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?auto=format&fit=crop&w=1200&q=80",
    reserve: "8000",
    increment: "750",
    duration: "180",
    category: "Setup",
    priceTag: "desk flex",
  },
];

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const [hydrated, setHydrated] = useState(false);
  const isAdmin = isConnected && address?.toLowerCase() === ADMIN_ADDRESS;

  const { data: nextId, refetch: refetchNextId } = useReadContract({
    address: FACTORY_ADDRESS, abi: factoryAbi, chainId: CHAIN_ID, functionName: "nextId",
    query: { enabled: !!FACTORY_ADDRESS },
  });

  const { data: onChainAddresses, refetch: refetchAuctions } = useReadContract({
    address: FACTORY_ADDRESS, abi: factoryAbi, chainId: CHAIN_ID, functionName: "getAuctions",
    args: [0n, nextId ?? 0n],
    query: { enabled: !!FACTORY_ADDRESS && !!nextId && nextId > 0n },
  });

  const allAuctions = ((onChainAddresses as `0x${string}`[] | undefined) ?? []).slice().reverse();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hideAuction = (addr: string) => setHidden(prev => {
    const next = new Set(prev); next.add(addr.toLowerCase());
    localStorage.setItem("admin_hidden_auctions", JSON.stringify([...next]));
    return next;
  });
  const auctions = allAuctions.filter(a => !hidden.has(a.toLowerCase()));

  const [sellerRows, setSellerRows]   = useState<SellerRow[]>([]);
  const [duneLoading, setDuneLoading] = useState(false);
  const [duneFallback, setDuneFallback] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      setHidden(new Set(JSON.parse(localStorage.getItem("admin_hidden_auctions") ?? "[]")));
    } catch {
      setHidden(new Set());
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    setDuneLoading(true);
    fetch(`/api/dune/seller?address=${address}`)
      .then((r) => r.json())
      .then((d) => { setSellerRows(d.rows ?? []); setDuneFallback(!!d.fallback); })
      .catch(() => setDuneFallback(true))
      .finally(() => setDuneLoading(false));
  }, [address]);

  const totalRevenue = sellerRows.reduce((s, r) => s + (r.payout_tokens ?? 0), 0);
  const totalFees    = sellerRows.reduce((s, r) => s + (r.fee_tokens ?? 0), 0);

  const refetchAll = () => { refetchNextId(); setTimeout(refetchAuctions, 500); };

  if (!hydrated) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: FONT }}>
        <div style={{ maxWidth: 600, margin: "0 auto", borderLeft: BORDER, borderRight: BORDER, minHeight: "100vh" }}>
          <div style={{
            position: "sticky", top: 0, zIndex: 10,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)",
            borderBottom: BORDER, padding: "12px 16px",
          }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Admin</h1>
          </div>
          <div style={{ padding: "28px 16px", color: "#536471", fontSize: 14 }}>
            Loading admin…
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, fontFamily: FONT }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: 0 }}>Connect wallet to access admin</p>
        <ConnectButton />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: FONT }}>
        <div style={{ fontSize: 40 }}>🚫</div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: 700, margin: 0 }}>Not authorized</p>
        <p style={{ color: "#536471", fontSize: 12, fontFamily: "monospace", margin: 0 }}>{address}</p>
        <Link href="/" style={{ color: "#1d9bf0", textDecoration: "none", fontSize: 14, marginTop: 12 }}>← Back to feed</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: FONT }}>
      <div style={{ maxWidth: 600, margin: "0 auto", borderLeft: BORDER, borderRight: BORDER, minHeight: "100vh" }}>

        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)",
          borderBottom: BORDER, padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: "50%", color: "white",
              textDecoration: "none", fontSize: 18, background: "rgba(255,255,255,0.06)", border: BORDER,
            }}>←</Link>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Admin</h1>
              <p style={{ fontSize: 11, color: "#536471", fontFamily: "monospace", margin: 0 }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
            </div>
          </div>
          <ConnectButton showBalance={false} />
        </div>

        {/* Analytics section */}
        <div style={{ borderBottom: BORDER }}>
          <div style={{ padding: "16px 16px 0" }}>
            <p style={{ color: "#536471", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 12px" }}>
              Sales Analytics
            </p>
          </div>

          {duneFallback ? (
            <div style={{ margin: "0 16px 16px", padding: "16px 20px", background: "rgba(29,155,240,0.06)", border: "1px solid rgba(29,155,240,0.15)", borderRadius: 16, textAlign: "center" }}>
              <p style={{ color: "#ccc", fontSize: 14, margin: "0 0 6px", fontWeight: 600 }}>Analytics available once AuctionMetrics is deployed</p>
              <p style={{ color: "#536471", fontSize: 12, margin: 0 }}>Dune will index Sepolia events automatically</p>
            </div>
          ) : duneLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 80, borderRadius: 14, background: "#111", border: BORDER, animation: "shimmer 1.4s infinite", backgroundImage: "linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%)", backgroundSize: "200% 100%" }} />
              ))}
              <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
                <AnalyticsCard label="Total Sold" value={String(sellerRows.length)} icon="📦" accent="#448aff" />
                <AnalyticsCard label="Revenue" value={`${totalRevenue.toFixed(0)}`} sub="tokens" icon="💰" accent="#00e676" />
                <AnalyticsCard label="Fees Paid" value={`${totalFees.toFixed(0)}`} sub="tokens" icon="⚡" accent="#e040fb" />
              </div>

              {/* Settled sales list */}
              {sellerRows.length > 0 && (
                <div style={{ borderTop: BORDER }}>
                  {sellerRows.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", borderBottom: i < sellerRows.length - 1 ? BORDER : "none",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 4, height: 36, borderRadius: 4, background: "linear-gradient(180deg, #00e676, #1d9bf0)", flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600, color: "#fff", margin: "0 0 2px" }}>
                            {r.auction?.slice(0, 8)}…{r.auction?.slice(-4)}
                          </p>
                          <p style={{ color: "#536471", fontSize: 11, margin: 0 }}>
                            Winner: {r.winner?.slice(0, 6)}…{r.winner?.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ color: "#00e676", fontSize: 14, fontWeight: 800, margin: "0 0 2px" }}>
                          +{(r.payout_tokens ?? 0).toFixed(2)} tkn
                        </p>
                        <p style={{ color: "#536471", fontSize: 11, margin: 0 }}>
                          {r.block_time ? new Date(r.block_time).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Create listing */}
        <CreateListingBox onCreated={refetchAll} adminAddress={address!} factoryNextId={nextId as bigint | undefined} />

        {/* Divider */}
        <div style={{ borderBottom: BORDER, borderTop: BORDER, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ color: "#536471", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>
            Listings · {auctions.length}
          </p>
          {hidden.size > 0 && (
            <button onClick={() => { setHidden(new Set()); localStorage.removeItem("admin_hidden_auctions"); }}
              style={{ background: "none", border: "none", color: "#536471", fontSize: 11, cursor: "pointer", padding: 0 }}>
              Show {hidden.size} hidden
            </button>
          )}
        </div>

        {/* Auction list */}
        {auctions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10 }}>
            <span style={{ fontSize: 40 }}>📭</span>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, margin: 0 }}>
              {FACTORY_ADDRESS ? "No listings yet — create one above" : "No factory address configured"}
            </p>
          </div>
        ) : (
          auctions.map((addr) => <AuctionRow key={addr} address={addr} onHide={hideAuction} />)
        )}
      </div>
    </div>
  );
}

function AnalyticsCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: string; accent: string }) {
  return (
    <div style={{
      background: "#0d0d0d", border: BORDER, borderRadius: 16,
      borderTop: `3px solid ${accent}30`,
      padding: "14px 12px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 10, right: 12, fontSize: 20, opacity: 0.6 }}>{icon}</div>
      <p style={{ color: "#536471", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>{label}</p>
      <p style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1 }}>
        {value}
        {sub && <span style={{ fontSize: 11, color: "#536471", fontWeight: 500, marginLeft: 4 }}>{sub}</span>}
      </p>
    </div>
  );
}

// ── Create Listing ────────────────────────────────────────────────────────────

function CreateListingBox({ onCreated, adminAddress, factoryNextId }: { onCreated: () => void; adminAddress: string; factoryNextId: bigint | undefined }) {
  const [title, setTitle]         = useState("");
  const [imageUrl, setImageUrl]   = useState("");
  const [reserve, setReserve]     = useState(DEFAULT_RESERVE);
  const [increment, setIncrement] = useState(DEFAULT_INCREMENT);
  const [duration, setDuration]   = useState(DEFAULT_DURATION);
  const [showAdv, setShowAdv]     = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [queuedPresetIds, setQueuedPresetIds] = useState<string[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const { writeContract: writeCreate, data: createTxHash, isPending: isCreating, reset } = useWriteContract();
  const { writeContract: writeActivate, isPending: isActivating } = useWriteContract();
  const { isSuccess: createConfirmed, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: createTxHash, chainId: CHAIN_ID });

  const presetById = Object.fromEntries(DEMO_LISTINGS.map((preset) => [preset.id, preset])) as Record<string, ListingPreset>;
  const selectedPresets = selectedPresetIds.map((id) => presetById[id]).filter(Boolean);
  const queuedPresets = queuedPresetIds.map((id) => presetById[id]).filter(Boolean);

  function clearComposer() {
    setTitle("");
    setImageUrl("");
    setReserve(DEFAULT_RESERVE);
    setIncrement(DEFAULT_INCREMENT);
    setDuration(DEFAULT_DURATION);
    setActivePresetId(null);
  }

  function loadPreset(preset: ListingPreset) {
    setTitle(preset.title);
    setImageUrl(preset.imageUrl);
    setReserve(preset.reserve);
    setIncrement(preset.increment);
    setDuration(preset.duration);
    setActivePresetId(preset.id);
    setShowAdv(true);
  }

  function togglePreset(id: string) {
    setSelectedPresetIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  }

  function queueSelectedPresets() {
    if (selectedPresets.length === 0) return;
    setQueuedPresetIds((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const preset of selectedPresets) {
        if (!seen.has(preset.id)) {
          next.push(preset.id);
          seen.add(preset.id);
        }
      }
      return next;
    });

    if (!title.trim()) loadPreset(selectedPresets[0]);
  }

  function loadFirstSelectedPreset() {
    if (selectedPresets.length === 0) return;
    loadPreset(selectedPresets[0]);
  }

  // After create confirmed, fetch the new auction address then activate it
  const { data: newAddrs, refetch: fetchNewAddr } = useReadContract({
    address: FACTORY_ADDRESS, abi: factoryAbi, chainId: CHAIN_ID, functionName: "getAuctions",
    args: [factoryNextId ?? 0n, (factoryNextId ?? 0n) + 1n],
    query: { enabled: false },
  });

  useEffect(() => {
    if (createConfirmed) { fetchNewAddr(); }
  }, [createConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const addrs = newAddrs as `0x${string}`[] | undefined;
    if (!addrs || addrs.length === 0) return;
    const addr = addrs[0];
    writeActivate({ address: addr, abi: auctionAbi, chainId: CHAIN_ID, functionName: "activate", args: [], gas: 300_000n });

    const remainingQueue = activePresetId ? queuedPresetIds.filter((id) => id !== activePresetId) : queuedPresetIds;
    setQueuedPresetIds(remainingQueue);

    if (remainingQueue.length > 0) {
      const nextPreset = presetById[remainingQueue[0]];
      if (nextPreset) loadPreset(nextPreset);
      else clearComposer();
    } else {
      clearComposer();
    }

    reset(); onCreated();
  }, [newAddrs]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleCreate = () => {
    if (!title.trim()) return;
    writeCreate({
      address: FACTORY_ADDRESS, abi: factoryAbi, chainId: CHAIN_ID, functionName: "createAuction",
      args: [
        TOKEN_ADDRESS,
        parseUnits(reserve || "0", 18),
        parseUnits(increment || "0", 18),
        BigInt(duration || "180"),
        title.trim(),
        imageUrl.trim(),
        adminAddress as `0x${string}`,
      ],
      gas: 3_000_000n, // factory deploys a new contract — needs higher gas
    });
  };

  const busy = isCreating || isConfirming || isActivating;

  return (
    <div style={{ borderBottom: BORDER, padding: "16px" }}>
      <div style={{ display: "flex", gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #1d9bf0, #7856ff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 800, color: "#fff",
          border: "2px solid rgba(29,155,240,0.3)",
        }}>
          A
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <div>
                <p style={{ color: "#fff", fontSize: 14, fontWeight: 800, margin: 0 }}>Demo Inventory</p>
                <p style={{ color: "#536471", fontSize: 12, margin: "2px 0 0" }}>
                  Tap real-looking products to load them fast, or multi-select and queue a whole batch.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setSelectedPresetIds(DEMO_LISTINGS.map((preset) => preset.id))}
                  style={{ background: "none", border: "none", color: "#1d9bf0", fontSize: 12, cursor: "pointer", padding: 0 }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedPresetIds([])}
                  style={{ background: "none", border: "none", color: "#536471", fontSize: 12, cursor: "pointer", padding: 0 }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
              {DEMO_LISTINGS.map((preset) => {
                const selected = selectedPresetIds.includes(preset.id);
                const active = activePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => loadPreset(preset)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        loadPreset(preset);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      minWidth: 190,
                      background: active ? "rgba(29,155,240,0.12)" : "#0d0d0d",
                      border: active || selected ? "1px solid rgba(29,155,240,0.5)" : BORDER,
                      borderRadius: 18,
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      overflow: "hidden",
                      position: "relative",
                      boxShadow: active ? "0 0 0 1px rgba(29,155,240,0.25)" : "none",
                    }}
                  >
                    <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); togglePreset(preset.id); }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          border: selected ? "none" : "1px solid rgba(255,255,255,0.25)",
                          background: selected ? "#1d9bf0" : "rgba(0,0,0,0.45)",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {selected ? "✓" : "+"}
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.imageUrl} alt={preset.title} style={{ width: "100%", height: 132, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#1d9bf0", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.7px" }}>{preset.category}</span>
                        <span style={{ color: "#00e676", fontSize: 10, fontWeight: 700 }}>{preset.priceTag}</span>
                      </div>
                      <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1.35, margin: "0 0 8px" }}>
                        {preset.title}
                      </p>
                      <p style={{ color: "#536471", fontSize: 11, margin: 0 }}>
                        Reserve {preset.reserve} · raise {preset.increment}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ color: "#536471", fontSize: 12, margin: 0 }}>
                {selectedPresets.length === 0 ? "No demo products selected" : `${selectedPresets.length} product${selectedPresets.length === 1 ? "" : "s"} selected`}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={loadFirstSelectedPreset}
                  disabled={selectedPresets.length === 0}
                  style={{
                    background: "transparent", border: BORDER, color: "#fff", fontSize: 12, fontWeight: 700,
                    borderRadius: 999, padding: "7px 12px", cursor: selectedPresets.length === 0 ? "not-allowed" : "pointer",
                    opacity: selectedPresets.length === 0 ? 0.45 : 1,
                  }}
                >
                  Load selected
                </button>
                <button
                  type="button"
                  onClick={queueSelectedPresets}
                  disabled={selectedPresets.length === 0}
                  style={{
                    background: "#1d9bf0", border: "none", color: "#fff", fontSize: 12, fontWeight: 800,
                    borderRadius: 999, padding: "8px 14px", cursor: selectedPresets.length === 0 ? "not-allowed" : "pointer",
                    opacity: selectedPresets.length === 0 ? 0.45 : 1,
                  }}
                >
                  Queue selected
                </button>
              </div>
            </div>

            {queuedPresets.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 16, background: "#0d0d0d", border: BORDER }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 800, margin: 0 }}>Queued Listings · {queuedPresets.length}</p>
                  <button
                    type="button"
                    onClick={() => setQueuedPresetIds([])}
                    style={{ background: "none", border: "none", color: "#536471", fontSize: 12, cursor: "pointer", padding: 0 }}
                  >
                    Clear queue
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {queuedPresets.map((preset) => (
                    <div key={preset.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#111", border: BORDER, borderRadius: 999, padding: "6px 10px" }}>
                      <span style={{ color: preset.id === activePresetId ? "#1d9bf0" : "#fff", fontSize: 12, fontWeight: 700 }}>{preset.title}</span>
                      <button
                        type="button"
                        onClick={() => loadPreset(preset)}
                        style={{ background: "none", border: "none", color: "#1d9bf0", fontSize: 11, cursor: "pointer", padding: 0 }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => setQueuedPresetIds((prev) => prev.filter((id) => id !== preset.id))}
                        style={{ background: "none", border: "none", color: "#536471", fontSize: 11, cursor: "pointer", padding: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Title textarea */}
          <textarea
            placeholder="What are you listing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={2}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontSize: 20, color: "#fff", resize: "none", fontFamily: FONT,
            }}
          />

          {/* Image URL */}
          <input
            type="url"
            placeholder="Paste image URL (optional)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: FONT,
              borderBottom: "1px solid #2f3336", paddingBottom: 10, marginBottom: 12,
            }}
          />

          {/* Image preview */}
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" style={{ width: "100%", borderRadius: 16, objectFit: "cover", maxHeight: 200, marginBottom: 12, border: BORDER }} />
          )}

          {/* Advanced toggle */}
          <button onClick={() => setShowAdv((v) => !v)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#1d9bf0", fontSize: 13, padding: 0, marginBottom: 12,
          }}>
            {showAdv ? "▲ Hide settings" : "▼ Auction settings"}
          </button>

          {showAdv && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Reserve (tokens)", value: reserve, set: setReserve },
                { label: "Min increment", value: increment, set: setIncrement },
                { label: "Duration (sec)", value: duration, set: setDuration },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label style={{ color: "#536471", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>{label}</label>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    style={{
                      width: "100%", background: "#111", border: BORDER, borderRadius: 10,
                      padding: "8px 10px", color: "#fff", fontSize: 13, fontFamily: FONT,
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#1d9bf0")}
                    onBlur={(e) => (e.target.style.borderColor = "#2f3336")}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: BORDER }}>
            <span style={{ color: "#536471", fontSize: 12 }}>
              Reserve {reserve} · {Number(duration) >= 3600 ? `${Math.round(Number(duration)/3600)}h` : Number(duration) >= 60 ? `${Math.round(Number(duration)/60)}m` : `${duration}s`} duration
            </span>
            <button
              onClick={handleCreate}
              disabled={busy || !title.trim() || !FACTORY_ADDRESS}
              style={{
                background: busy ? "#555" : "#fff",
                color: "#000", fontWeight: 800, fontSize: 14,
                padding: "9px 20px", borderRadius: 50,
                border: "none", cursor: busy ? "not-allowed" : "pointer",
                opacity: (!title.trim() || !FACTORY_ADDRESS) ? 0.4 : 1,
                transition: "opacity 0.15s, background 0.15s",
              }}
            >
              {isCreating ? "Confirm in wallet…" : isConfirming ? "Creating…" : isActivating ? "Activating…" : queuedPresets.length > 0 ? `Post & Activate · ${queuedPresets.length} queued` : "Post & Activate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Auction Row ───────────────────────────────────────────────────────────────

function AuctionRow({ address, onHide }: { address: `0x${string}`; onHide: (a: string) => void }) {
  const { writeContract, isPending, data: txHash, error: writeError } = useWriteContract();
  const [countdown, setCountdown]    = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const canRepairRpc = ROBINHOOD_RPC_URL !== DEFAULT_ROBINHOOD_RPC;

  const { data: state, refetch: refetchState } = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "currentState" });
  const { data: startTime }    = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "startTime" });
  const { data: endTime }      = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "endTime" });
  const { data: highestBid }   = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "highestBid" });
  const { data: highestBidder} = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "highestBidder" });
  const { data: title }        = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "metadataURI" });
  const { data: imageURI }     = useReadContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: "imageURI" });

  const stateNum = state !== undefined ? Number(state) : -1;
  const stateColor = STATE_COLORS[stateNum] ?? "#71767b";
  const stateBg    = STATE_BG[stateNum] ?? "#71767b15";
  const highestBidRaw = highestBid as bigint | undefined;
  const hasLiveBid = !!highestBidder && (highestBidder as string).toLowerCase() !== ZERO_ADDRESS && highestBidRaw !== undefined && highestBidRaw > 0n;
  const refreshState = useEffectEvent(() => {
    void refetchState();
  });

  useEffect(() => {
    const target = stateNum === 1 ? startTime : stateNum === 2 ? endTime : null;
    if (!target) { setCountdown(null); return; }
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const secs = Number(target) - Math.floor(Date.now() / 1000);
      setCountdown(Math.max(0, secs));
      if (secs <= 0 && !pollInterval) {
        // Timer expired — poll on-chain every 2s until currentState() returns ENDED
        pollInterval = setInterval(() => {
          refreshState();
        }, 2000);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [stateNum, startTime, endTime]);

  // Refetch state as soon as the tx is confirmed on-chain (no blind timeout)
  const { isSuccess: txConfirmed, error: txReceiptError } = useWaitForTransactionReceipt({ hash: txHash, chainId: CHAIN_ID });
  useEffect(() => {
    if (txConfirmed) {
      setTxError(null);
      refreshState();
    }
  }, [txConfirmed]);

  useEffect(() => {
    const err = txReceiptError ?? writeError;
    if (!err) return;
    setTxError(normalizeWalletError(err));
  }, [txReceiptError, writeError]);

  async function repairWalletRpc() {
    if (typeof window === "undefined") return;
    const ethereum = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return;

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${CHAIN_ID.toString(16)}`,
        chainName: robinhoodTestnet.name,
        nativeCurrency: robinhoodTestnet.nativeCurrency,
        rpcUrls: [ROBINHOOD_RPC_URL],
        blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url],
      }],
    });
  }

  const call = (fn: "activate" | "pause" | "settle" | "end") => {
    // Explicit gas for all calls — avoids MetaMask estimation failure on Robinhood testnet
    setTxError(null);
    writeContract({ address, abi: auctionAbi, chainId: CHAIN_ID, functionName: fn, gas: 300_000n });
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{
      display: "flex", gap: 12, padding: "14px 16px",
      borderBottom: BORDER, transition: "background 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Thumbnail */}
      <div style={{
        width: 48, height: 48, borderRadius: 10, flexShrink: 0, overflow: "hidden",
        background: "#1a1a1a", border: BORDER,
      }}>
        {imageURI ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageURI as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1d9bf020, #7856ff20)" }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title + state */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
            {(title as string) || "Untitled"}
          </span>
          <span style={{ color: "#536471", fontSize: 11, fontFamily: "monospace" }}>
            {address.slice(0, 8)}…{address.slice(-4)}
          </span>
          {stateNum >= 0 && (
            <span style={{
              padding: "2px 8px", borderRadius: 50, fontSize: 10, fontWeight: 700,
              color: stateColor, background: stateBg,
              border: `1px solid ${stateColor}30`, marginLeft: "auto",
            }}>
              {STATE_LABELS[stateNum] ?? "…"}
            </span>
          )}
          <button onClick={() => onHide(address)} title="Hide listing"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#536471", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Countdown */}
        {countdown !== null && (
          <p style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 900, color: "#fff", margin: "4px 0 6px" }}>
            {fmtTime(countdown)}
            <span style={{ fontSize: 11, color: "#536471", fontWeight: 400, fontFamily: FONT, marginLeft: 8 }}>
              {stateNum === 1 ? "until start" : "remaining"}
            </span>
          </p>
        )}

        {/* Bid info */}
        {(stateNum === 2 || stateNum === 3 || stateNum === 4) && highestBid !== undefined && (
          <p style={{ fontSize: 13, color: "#536471", margin: "0 0 10px" }}>
            {hasLiveBid ? (
              <>
                Top bid:{" "}
                <span style={{ color: "#00e676", fontWeight: 700 }}>
                  {(Number(highestBid) / 1e18).toFixed(2)} tkn
                </span>
                <span style={{ marginLeft: 6 }}>
                  by {(highestBidder as string).slice(0, 6)}…{(highestBidder as string).slice(-4)}
                </span>
              </>
            ) : (
              <span>No bids yet</span>
            )}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stateNum === 0 && (
            <ActionBtn onClick={() => call("activate")} disabled={isPending} primary>
              {isPending ? "…" : "Activate"}
            </ActionBtn>
          )}
          {/* Pause only while time is still running */}
          {(stateNum === 1 || stateNum === 2) && (countdown === null || countdown > 0) && (
            <ActionBtn onClick={() => call("pause")} disabled={isPending}>
              {isPending ? "…" : "Pause"}
            </ActionBtn>
          )}
          {stateNum === 3 && (
            <ActionBtn onClick={() => call("settle")} disabled={isPending} primary>
              {isPending ? "…" : "Settle & Pay Out"}
            </ActionBtn>
          )}
          <Link href={`/auction/${address}`} style={{
            padding: "6px 14px", borderRadius: 50, fontSize: 13, fontWeight: 600,
            color: "#536471", textDecoration: "none",
            border: "1px solid #2f3336", background: "transparent",
            display: "inline-block", transition: "color 0.15s",
          }}>
            View ↗
          </Link>
        </div>
        {txError && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{txError}</p>
            {canRepairRpc && /rate limit|defined limit|rate limited/i.test(txError) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void repairWalletRpc()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    background: "#f59e0b",
                    color: "#000",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Update Wallet RPC
                </button>
                <span style={{ color: "#f4b400", fontSize: 11 }}>
                  Your wallet is likely using Robinhood&apos;s public RPC. Switch it to your Alchemy Robinhood RPC URL.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, primary }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 16px", borderRadius: 50, fontSize: 13, fontWeight: 700,
        border: primary ? "none" : "1px solid #536471",
        background: primary ? "#1d9bf0" : "transparent",
        color: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}
