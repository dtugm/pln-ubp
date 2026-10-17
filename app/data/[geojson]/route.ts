import { NextResponse } from "next/server";

export const runtime = "nodejs";

const R2_DATA_BASE =
  "https://pub-b1a30761571c4deda99b775a859ed84c.r2.dev/data";

const ALLOWED_FILES = new Set([
  "BM.geojson",
  "Bangunan.geojson",
  "Jalan.geojson",
  "Kolam.geojson",
  "Kontur Mayor.geojson",
  "Kontur Minor.geojson",
  "Lahan Terbuka.geojson",
  "Pagar.geojson",
  "Pipa ESDM.geojson",
  "Pipa SPP.geojson",
  "Rawa.geojson",
  "Rel KA.geojson",
  "Selokan.geojson",
  "Sempadan Sungai.geojson",
  "Sungai.geojson",
  "Tangki.geojson",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ geojson: string }> },
) {
  const { geojson: filename } = await context.params;

  // Hanya izinkan nama file GeoJSON yang memang digunakan oleh peta.
  if (!ALLOWED_FILES.has(filename)) {
    return NextResponse.json(
      { error: "File GeoJSON tidak diizinkan." },
      { status: 404 },
    );
  }

  const upstreamUrl = `${R2_DATA_BASE}/${encodeURIComponent(filename)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/geo+json, application/json" },
      // Data digitasi di-cache oleh CDN/browser selama satu jam.
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      console.error(
        `R2 mengembalikan HTTP ${upstream.status} untuk ${filename}`,
      );
      return NextResponse.json(
        { error: `Gagal mengambil ${filename} dari penyimpanan data.` },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/geo+json; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error(`Proxy R2 gagal untuk ${filename}:`, error);
    return NextResponse.json(
      { error: "Server WebGIS tidak berhasil terhubung ke Cloudflare R2." },
      { status: 502 },
    );
  }
}
