/**
 * Auto-bid agent
 * Watches LeaderChanged events and re-bids up to a max policy per auction.
 * One funded agent wallet shared across all watched auctions.
 */

import { createWalletClient, createPublicClient, http, parseAbi, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY ?? "";

// ── ABIs ──────────────────────────────────────────────────────────────────────

const auctionAbi = parseAbi([
  "function bid(uint256 amount) external",
  "function currentState() view returns (uint8)",
  "function highestBid() view returns (uint256)",
  "function highestBidder() view returns (address)",
  "function reservePrice() view returns (uint256)",
  "function minIncrement() view returns (uint256)",
  "function currency() view returns (address)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// ── Policy store ──────────────────────────────────────────────────────────────

export interface BidPolicy {
  maxBid:     bigint;  // max bid in token wei
  increment:  bigint;  // how much to add above current highest
  cooldownMs: number;  // min ms between bids
  currencyAddress: `0x${string}`;
}

interface PolicyRecord extends BidPolicy {
  lastBidAt: number;
}

const policies = new Map<string, PolicyRecord>(); // lowercase auction addr → policy

// ── Clients ───────────────────────────────────────────────────────────────────

let walletClient: ReturnType<typeof createWalletClient> | null = null;
let publicClient: ReturnType<typeof createPublicClient> | null = null;
let agentAddress: `0x${string}` | null = null;
let agentAccount: ReturnType<typeof privateKeyToAccount> | null = null;

export function initAgent(rpcHttp: string, chain: Chain) {
  walletClient = null;
  publicClient = null;
  agentAddress = null;
  agentAccount = null;

  if (!AGENT_PRIVATE_KEY) {
    console.log("agent: disabled (set AGENT_PRIVATE_KEY to enable)");
    return;
  }

  const normalizedKey = (AGENT_PRIVATE_KEY.startsWith("0x") ? AGENT_PRIVATE_KEY : `0x${AGENT_PRIVATE_KEY}`) as `0x${string}`;
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(normalizedKey);
  } catch {
    console.warn("agent: disabled (invalid AGENT_PRIVATE_KEY)");
    return;
  }

  agentAddress = account.address;
  agentAccount = account;
  walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcHttp),
  });

  publicClient = createPublicClient({
    chain,
    transport: http(rpcHttp),
  });

  console.log(`agent: wallet ${agentAddress}`);
}

export function isAgentReady() {
  return !!walletClient && !!publicClient && !!agentAddress;
}

export function getAgentAddress() {
  return agentAddress;
}

// ── Policy management ─────────────────────────────────────────────────────────

export function setPolicy(auctionAddress: string, policy: BidPolicy) {
  policies.set(auctionAddress.toLowerCase(), { ...policy, lastBidAt: 0 });
  console.log(`agent: watching ${auctionAddress} (max=${policy.maxBid}, inc=${policy.increment})`);
}

export function removePolicy(auctionAddress: string) {
  policies.delete(auctionAddress.toLowerCase());
}

export function getPolicies(): Record<string, Omit<PolicyRecord, "currencyAddress">> {
  const out: Record<string, Omit<PolicyRecord, "currencyAddress">> = {};
  for (const [addr, p] of policies) {
    out[addr] = { maxBid: p.maxBid, increment: p.increment, cooldownMs: p.cooldownMs, lastBidAt: p.lastBidAt };
  }
  return out;
}

async function computeNextBid(
  auctionAddress: string,
  policy: PolicyRecord,
): Promise<bigint | null> {
  if (!publicClient || !agentAddress) return null;

  const [state, highestBid, highestBidder, reservePrice, minIncrement] = await Promise.all([
    publicClient.readContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "currentState",
    }),
    publicClient.readContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "highestBid",
    }),
    publicClient.readContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "highestBidder",
    }),
    publicClient.readContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "reservePrice",
    }),
    publicClient.readContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "minIncrement",
    }),
  ]);

  if (Number(state) !== 2) {
    console.log(`agent: ${auctionAddress} is not active`);
    return null;
  }

  if ((highestBidder as string).toLowerCase() === agentAddress.toLowerCase()) {
    return null;
  }

  const minRaise = policy.increment > (minIncrement as bigint) ? policy.increment : (minIncrement as bigint);
  const nextBid = (highestBid as bigint) > 0n
    ? (highestBid as bigint) + minRaise
    : (reservePrice as bigint);

  if (nextBid > policy.maxBid) {
    console.log(`agent: max bid reached for ${auctionAddress} (would need ${nextBid})`);
    return null;
  }

  return nextBid;
}

async function placeBid(auctionAddress: string, policy: PolicyRecord, nextBid: bigint) {
  if (!walletClient || !publicClient || !agentAddress || !agentAccount) return;

  const allowance = await publicClient.readContract({
    address: policy.currencyAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [agentAddress, auctionAddress as `0x${string}`],
  });

  if ((allowance as bigint) < nextBid) {
    console.log(`agent: approving ${policy.maxBid} of ${policy.currencyAddress}`);
    const approvalHash = await walletClient.writeContract({
      account: agentAccount,
      chain: undefined,
      address: policy.currencyAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [auctionAddress as `0x${string}`, policy.maxBid],
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalHash });
  }

  const hash = await walletClient.writeContract({
    account: agentAccount,
    chain: undefined,
    address: auctionAddress as `0x${string}`,
    abi: auctionAbi,
    functionName: "bid",
    args: [nextBid],
  });

  console.log(`agent: bid ${nextBid} on ${auctionAddress} -> ${hash}`);
}

export async function triggerPolicy(auctionAddress: string) {
  if (!isAgentReady()) return false;

  const policy = policies.get(auctionAddress.toLowerCase());
  if (!policy) return false;

  const now = Date.now();
  if (now - policy.lastBidAt < policy.cooldownMs) {
    console.log(`agent: cooldown active for ${auctionAddress}`);
    return false;
  }

  const nextBid = await computeNextBid(auctionAddress, policy);
  if (nextBid === null) return false;

  const previousLastBidAt = policy.lastBidAt;
  policy.lastBidAt = now;
  try {
    await placeBid(auctionAddress, policy, nextBid);
    return true;
  } catch (err) {
    policy.lastBidAt = previousLastBidAt;
    throw err;
  }
}

// ── Reaction to LeaderChanged ─────────────────────────────────────────────────

export async function onLeaderChanged(auctionAddress: string) {
  try {
    await triggerPolicy(auctionAddress);
  } catch (err) {
    console.error(`agent: bid failed on ${auctionAddress}:`, err);
  }
}
