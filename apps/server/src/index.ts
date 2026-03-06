import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createPublicClient, webSocket, http, parseAbi } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { initAgent, onLeaderChanged, setPolicy, removePolicy, getPolicies } from "./agent";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// ── Config ────────────────────────────────────────────────────────────────────

const CHAIN    = process.env.CHAIN || "arb";
const FACTORY  = process.env.FACTORY_ADDRESS as `0x${string}` | undefined;
const RPC_HTTP = process.env.ALCHEMY_ARB_SEPOLIA_RPC || process.env.RPC_HTTP || "";
const RPC_WS   = process.env.ALCHEMY_ARB_SEPOLIA_WS  || process.env.RPC_WS;

if (!FACTORY) console.warn("⚠  FACTORY_ADDRESS not set — event watching disabled");

// ── Viem client ───────────────────────────────────────────────────────────────

const client =
  CHAIN === "arb" && RPC_WS
    ? createPublicClient({ chain: arbitrumSepolia, transport: webSocket(RPC_WS) })
    : createPublicClient({ chain: arbitrumSepolia, transport: http(RPC_HTTP) });

// ── ABIs ──────────────────────────────────────────────────────────────────────

const factoryAbi = parseAbi([
  "event AuctionCreated(uint256 indexed auctionId, address indexed auction, address indexed seller, address currency, string metadataURI, string imageURI)",
]);

const auctionAbi = parseAbi([
  "event Activated(uint256 startTime, uint256 endTime)",
  "event BidPlaced(address indexed bidder, uint256 amount)",
  "event LeaderChanged(address indexed leader, uint256 amount)",
  "event Ended(address indexed winner, uint256 amount)",
  "event Settled(address indexed seller, address indexed winner, uint256 sellerPayout, uint256 fee)",
]);

// ── In-memory store ───────────────────────────────────────────────────────────

interface AuctionRecord {
  address:     string;
  auctionId:   string;
  seller:      string;
  currency:    string;
  metadataURI: string;
  imageURI:    string;
  createdAt:   number;
}

const auctionStore: AuctionRecord[] = [];
const watchedAuctions = new Set<string>();

// ── Watch a specific auction contract ─────────────────────────────────────────

function watchAuction(address: `0x${string}`) {
  if (watchedAuctions.has(address)) return;
  watchedAuctions.add(address);

  client.watchContractEvent({
    address,
    abi: auctionAbi,
    eventName: "Activated",
    onLogs: (logs) => {
      for (const l of logs) {
        io.to(`auction:${address}`).emit("auction:activated", {
          auctionAddress: address,
          startTime: Number(l.args.startTime),
          endTime:   Number(l.args.endTime),
        });
      }
    },
  });

  client.watchContractEvent({
    address,
    abi: auctionAbi,
    eventName: "BidPlaced",
    onLogs: (logs) => {
      for (const l of logs) {
        io.to(`auction:${address}`).emit("bid:placed", {
          auctionAddress: address,
          bidder:      l.args.bidder,
          amount:      l.args.amount?.toString(),
          txHash:      l.transactionHash,
          blockNumber: Number(l.blockNumber),
          timestamp:   Date.now(),
        });
      }
    },
  });

  client.watchContractEvent({
    address,
    abi: auctionAbi,
    eventName: "LeaderChanged",
    onLogs: (logs) => {
      for (const l of logs) {
        io.to(`auction:${address}`).emit("leader:changed", {
          auctionAddress: address,
          leader: l.args.leader,
          amount: l.args.amount?.toString(),
          txHash: l.transactionHash,
        });

        // Trigger auto-bid agent
        if (l.args.leader && l.args.amount !== undefined) {
          onLeaderChanged(
            address,
            l.args.leader as string,
            l.args.amount as bigint,
          ).catch(console.error);
        }
      }
    },
  });

  client.watchContractEvent({
    address,
    abi: auctionAbi,
    eventName: "Ended",
    onLogs: (logs) => {
      for (const l of logs) {
        io.to(`auction:${address}`).emit("auction:ended", {
          auctionAddress: address,
          winner: l.args.winner,
          amount: l.args.amount?.toString(),
        });
      }
    },
  });

  client.watchContractEvent({
    address,
    abi: auctionAbi,
    eventName: "Settled",
    onLogs: (logs) => {
      for (const l of logs) {
        io.to(`auction:${address}`).emit("auction:settled", {
          auctionAddress: address,
          sellerPayout: l.args.sellerPayout?.toString(),
          fee:          l.args.fee?.toString(),
        });
      }
    },
  });

  console.log(`watching auction ${address}`);
}

// ── REST ──────────────────────────────────────────────────────────────────────

app.get("/health",   (_, res) => res.json({ ok: true }));
app.get("/auctions", (_, res) => res.json(auctionStore));

// Agent policy management
app.get("/agent", (_, res) => res.json(getPolicies()));

app.post("/agent/watch", (req, res) => {
  const { auctionAddress, maxBid, increment, cooldownMs, currencyAddress } = req.body;
  if (!auctionAddress || !maxBid || !increment || !currencyAddress) {
    res.status(400).json({ error: "required: auctionAddress, maxBid, increment, currencyAddress" });
    return;
  }
  setPolicy(auctionAddress, {
    maxBid:          BigInt(maxBid),
    increment:       BigInt(increment),
    cooldownMs:      Number(cooldownMs ?? 5000),
    currencyAddress: currencyAddress as `0x${string}`,
  });
  res.json({ ok: true });
});

app.delete("/agent/watch/:address", (req, res) => {
  removePolicy(req.params.address);
  res.json({ ok: true });
});

// ── Socket ────────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);
  socket.on("join:auction",  (addr: string) => socket.join(`auction:${addr}`));
  socket.on("join",          (addr: string) => socket.join(`auction:${addr}`));
  socket.on("leave:auction", (addr: string) => socket.leave(`auction:${addr}`));
  socket.on("disconnect",    () => console.log("client disconnected:", socket.id));
});

// ── Indexer + Agent init ──────────────────────────────────────────────────────

async function main() {
  initAgent(RPC_HTTP);

  if (!FACTORY) {
    console.log("server ready (set FACTORY_ADDRESS to enable indexing)");
    return;
  }

  client.watchContractEvent({
    address: FACTORY,
    abi: factoryAbi,
    eventName: "AuctionCreated",
    onLogs: (logs) => {
      for (const l of logs) {
        const record: AuctionRecord = {
          address:     l.args.auction as string,
          auctionId:   l.args.auctionId?.toString() ?? "",
          seller:      l.args.seller as string,
          currency:    l.args.currency as string,
          metadataURI: l.args.metadataURI as string,
          imageURI:    l.args.imageURI as string,
          createdAt:   Date.now(),
        };
        auctionStore.push(record);
        io.emit("AuctionCreated", l.args);
        watchAuction(record.address as `0x${string}`);
        console.log("new auction:", record.address);
      }
    },
  });

  console.log(`watching factory ${FACTORY}…`);
}

main().catch(console.error);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`server on :${PORT}`));
