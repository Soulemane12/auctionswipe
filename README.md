# AuctionSwipe

Real-time auction marketplace with a swipe-first discovery UX and a controlled activation gate.

Two deployments:
- **Robinhood Chain Testnet** — full public auction + settlement (track eligibility)
- **Arbitrum Sepolia** — privacy demo using **CoFHE** (encrypted bid values)

---

## Why it matters

On-chain auctions leak bidder strategy (timing + amounts). AuctionSwipe focuses on:

- Fast discovery (TikTok-style swipe feed)
- Live competition (real-time socket.io events, not polling)
- Admin-controlled activation gate (synchronized "room" feel)
- Optional bid-value privacy (CoFHE demo — amounts hidden in storage + logs)

---

## Tracks / Sponsors

| Sponsor | How it's used |
|---|---|
| **Alchemy** | WebSocket RPC for real-time event streaming (Arbitrum public RPC has no WS) |
| **OpenZeppelin** | ReentrancyGuard, Pausable, Ownable on all auction contracts |
| **Fhenix CoFHE** | Encrypted bid values on Arbitrum Sepolia (`AuctionFHE.sol`) |
| **Robinhood Chain** | Public auction lane deployed to Robinhood Chain Testnet |

---

## Architecture

```
auctionswipe/
  packages/
    contracts/   AuctionFactory + AuctionOpen (public lane)
                 AuctionFHE (CoFHE privacy demo)
    shared/      ABIs, TypeScript types, network constants
  apps/
    server/      viem indexer + socket.io broadcaster + auto-bid agent
    web/         Next.js — swipe feed, auction detail, admin (/soulemane), treasury
```

---

## Demo flow

1. Connect wallet on the swipe feed
2. Admin goes to `/soulemane` → clicks **Activate** → 2m30 countdown begins
3. All viewers see countdown sync in real time
4. Bids placed → leader changes appear instantly for everyone (socket.io)
5. Auto-bid agent competes (policy: max bid + increment + cooldown)
6. Auction ends → admin calls **Settle** → fee captured
7. Switch to CoFHE deployment → show encrypted bid values (no amounts in logs)

---

## Local setup

### 1. Env

```bash
cp .env.example .env
```

Fill in:

```
DEPLOYER_PRIVATE_KEY=        # your wallet private key
ALCHEMY_ARB_SEPOLIA_RPC=     # https://arb-sepolia.g.alchemy.com/v2/<key>
ALCHEMY_ARB_SEPOLIA_WS=      # wss://arb-sepolia.g.alchemy.com/v2/<key>
ADMIN_ADDRESS=               # your wallet public address
NEXT_PUBLIC_ADMIN_ADDRESS=   # same as above
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=  # from cloud.walletconnect.com
FACTORY_ADDRESS=             # set after deploy step below
AGENT_PRIVATE_KEY=           # funded wallet for auto-bid agent (optional)
```

### 2. Install

```bash
pnpm install
```

### 3. Deploy contracts

```bash
cd packages/contracts

# Arbitrum Sepolia (public lane)
pnpm deploy:arb-sepolia

# Robinhood Chain Testnet (public lane)
pnpm deploy:robinhood

# CoFHE privacy demo (Arbitrum Sepolia only)
pnpm deploy:fhe
```

Copy the printed factory address into `.env` as `FACTORY_ADDRESS` and `NEXT_PUBLIC_FACTORY_ADDRESS_ARB_SEPOLIA`.

### 4. Run server

```bash
pnpm --filter @auctionswipe/server dev
```

### 5. Run web

```bash
pnpm --filter @auctionswipe/web dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Auto-bid agent

The server exposes a REST API to arm the agent on any auction:

```bash
curl -X POST http://localhost:4000/agent/watch \
  -H "Content-Type: application/json" \
  -d '{
    "auctionAddress": "0x...",
    "currencyAddress": "0x...",
    "maxBid": "1000000000000000000",
    "increment": "100000000000000000",
    "cooldownMs": 5000
  }'
```

The agent then watches `LeaderChanged` events and re-bids automatically up to `maxBid`.

---

## Security notes

- `ReentrancyGuard` on `bid()` and `settle()`
- Previous bidder refunded before new leader is set
- `Pausable` for emergency stop (admin only)
- Admin-only `activate()` gate — auctions cannot accept bids until explicitly started
- Fee capped at 10% max (`setFee` guard)

---

## Network references

| Network | Chain ID | RPC |
|---|---|---|
| Arbitrum Sepolia | 421614 | `arb-sepolia.g.alchemy.com/v2/<key>` |
| Robinhood Chain Testnet | 46630 | `rpc.testnet.chain.robinhood.com` |

- Arbitrum Sepolia explorer: https://sepolia.arbiscan.io
- Robinhood Chain explorer: https://explorer.testnet.chain.robinhood.com
- Robinhood faucet: https://faucet.testnet.chain.robinhood.com
