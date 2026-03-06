/**
 * Auto-bid agent
 * Watches LeaderChanged events and re-bids up to a max policy per auction.
 * One funded agent wallet shared across all watched auctions.
 */

import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;

// ── ABIs ──────────────────────────────────────────────────────────────────────

const auctionAbi = parseAbi([
  "function bid(uint256 amount) external",
  "function highestBid() view returns (uint256)",
  "function highestBidder() view returns (address)",
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

export function initAgent(rpcHttp: string) {
  if (!AGENT_PRIVATE_KEY) {
    console.log("agent: disabled (set AGENT_PRIVATE_KEY to enable)");
    return;
  }

  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
  agentAddress = account.address;

  walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpcHttp),
  });

  publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcHttp),
  });

  console.log(`agent: wallet ${agentAddress}`);
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

// ── Reaction to LeaderChanged ─────────────────────────────────────────────────

export async function onLeaderChanged(
  auctionAddress: string,
  leader: string,
  currentHighestBid: bigint,
) {
  if (!walletClient || !publicClient || !agentAddress) return;

  const addr = auctionAddress.toLowerCase();
  const policy = policies.get(addr);
  if (!policy) return;

  // Already the leader — nothing to do
  if (leader.toLowerCase() === agentAddress.toLowerCase()) return;

  // Cooldown guard
  const now = Date.now();
  if (now - policy.lastBidAt < policy.cooldownMs) {
    console.log(`agent: cooldown active for ${auctionAddress}`);
    return;
  }

  // Compute next bid
  const nextBid = currentHighestBid + policy.increment;
  if (nextBid > policy.maxBid) {
    console.log(`agent: max bid reached for ${auctionAddress} (would need ${nextBid})`);
    return;
  }

  policy.lastBidAt = now;

  try {
    // Ensure enough ERC20 allowance (approve up to maxBid in one shot)
    const allowance = await publicClient.readContract({
      address: policy.currencyAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [agentAddress, auctionAddress as `0x${string}`],
    });

    if ((allowance as bigint) < nextBid) {
      console.log(`agent: approving ${policy.maxBid} of ${policy.currencyAddress}`);
      await walletClient.writeContract({
        address: policy.currencyAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [auctionAddress as `0x${string}`, policy.maxBid],
      });
    }

    // Place bid
    const hash = await walletClient.writeContract({
      address: auctionAddress as `0x${string}`,
      abi: auctionAbi,
      functionName: "bid",
      args: [nextBid],
    });

    console.log(`agent: bid ${nextBid} on ${auctionAddress} → ${hash}`);
  } catch (err) {
    console.error(`agent: bid failed on ${auctionAddress}:`, err);
  }
}
