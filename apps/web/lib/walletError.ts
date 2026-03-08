export function normalizeWalletError(error: { message?: string } | null | undefined) {
  const message = error?.message?.trim();
  if (!message) return "Transaction failed.";

  if (/user denied|user rejected|rejected the request|denied transaction signature/i.test(message)) {
    return "Transaction canceled in MetaMask.";
  }

  if (/rate limit|defined limit|rate limited/i.test(message)) {
    return "Robinhood public RPC is rate-limiting this transaction. Switch MetaMask to your Alchemy Robinhood RPC and try again.";
  }

  if (/execution reverted|safeerc20|transfer amount exceeds balance|insufficient allowance/i.test(message)) {
    return "Transaction reverted onchain. Check that the auction is active, your bid meets the minimum, and you have enough approved tokens.";
  }

  const shortened = message
    .split(/Request Arguments:|Contract Call:|Docs:/)[0]
    ?.trim();

  return shortened || "Transaction failed.";
}
