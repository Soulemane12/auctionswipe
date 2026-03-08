const DEFAULT_ROBINHOOD_RPC = "https://rpc.testnet.chain.robinhood.com";

function getRpcUrl() {
  return process.env.ROBINHOOD_RPC || process.env.NEXT_PUBLIC_ROBINHOOD_RPC || DEFAULT_ROBINHOOD_RPC;
}

export async function POST(request: Request) {
  const body = await request.text();

  const upstream = await fetch(getRpcUrl(), {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
