import { NextRequest, NextResponse } from "next/server";

const DUNE_API_KEY = process.env.DUNE_API_KEY ?? "";
const QUERY_ID     = process.env.DUNE_QUERY_SELLER_STATS ?? "0";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("address")?.toLowerCase() ?? "";
  // Dune returns varbinary columns without 0x prefix
  const address = raw.startsWith("0x") ? raw.slice(2) : raw;

  if (!raw) {
    return NextResponse.json({ rows: [], error: "address required" }, { status: 400 });
  }

  if (!DUNE_API_KEY || QUERY_ID === "0") {
    return NextResponse.json({ rows: [], fallback: true });
  }

  try {
    const res = await fetch(
      `https://api.dune.com/api/v1/query/${QUERY_ID}/results?limit=100`,
      {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ rows: [], error: `Dune returned ${res.status}` });
    }

    const data = await res.json();
    const rows: Record<string, unknown>[] = data?.result?.rows ?? [];

    const filtered = rows.filter((r) => {
      const val = (r.seller as string)?.toLowerCase().replace(/^0x/, "");
      return val === address;
    });

    return NextResponse.json({ rows: filtered });
  } catch (e) {
    return NextResponse.json({ rows: [], error: (e as Error).message });
  }
}
