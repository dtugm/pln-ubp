import { NextResponse } from "next/server";

export const runtime = "nodejs";

const R2_ORTHOPHOTO_BASE =
  "https://pub-b1a30761571c4deda99b775a859ed84c.r2.dev/orthophoto";

type RouteContext = {
  params: Promise<{ ortho: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { ortho } = await context.params;

  if (!Array.isArray(ortho) || ortho.length !== 3) {
    return NextResponse.json(
      { error: "Path tile ortofoto harus berformat z/x/y.webp." },
      { status: 400 },
    );
  }

  const [z, x, y] = ortho;
  const zoom = Number(z);

  if (
    !Number.isInteger(zoom) ||
    zoom < 14 ||
    zoom > 22 ||
    !/^\d+$/.test(x) ||
    !/^\d+\.webp$/.test(y)
  ) {
    return NextResponse.json(
      { error: "Path tile ortofoto tidak valid." },
      { status: 400 },
    );
  }

  const upstreamUrl = `${R2_ORTHOPHOTO_BASE}/${zoom}/${x}/${y}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "image/webp" },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      console.error(
        `R2 mengembalikan HTTP ${upstream.status} untuk tile ${zoom}/${x}/${y}`,
      );
      return NextResponse.json(
        { error: `Tile ortofoto tidak ditemukan (HTTP ${upstream.status}).` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error(`Proxy tile ortofoto gagal untuk ${zoom}/${x}/${y}:`, error);
    return NextResponse.json(
      { error: "Server WebGIS tidak berhasil mengambil tile dari Cloudflare R2." },
      { status: 502 },
    );
  }
}
