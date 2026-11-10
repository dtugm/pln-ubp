import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const R2_DATA_BASE =
  "https://pub-b1a30761571c4deda99b775a859ed84c.r2.dev/data";

const ALLOWED_FILES = new Set([
  "AOI.geojson",
  "BM.geojson",
  "Bangunan.geojson",
  "Jalan.geojson",
  "Kolam.geojson",
  "Kontur Mayor.geojson",
  "Kontur Minor.geojson",
  "Lahan Terbuka.geojson",
  "Opsi Jalur Pipa 1.geojson",
  "Opsi Jalur Pipa 2.geojson",
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
  try {
    const params = await context.params;
    const filename = params?.geojson;

    if (!filename || !ALLOWED_FILES.has(filename)) {
      return NextResponse.json(
        {
          error: "File GeoJSON tidak diizinkan.",
          filename: filename ?? null,
        },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    // Query versi menghindari penggunaan URL upstream yang pernah dicache.
    const upstreamUrl =
      `${R2_DATA_BASE}/${encodeURIComponent(filename)}?v=${Date.now()}`;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/geo+json, application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!upstream.ok) {
      console.error(`R2 HTTP ${upstream.status} untuk ${filename}`);
      return NextResponse.json(
        {
          error: `Gagal mengambil ${filename} dari Cloudflare R2.`,
          upstreamStatus: upstream.status,
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Proxy GeoJSON R2 gagal:", error);
    return NextResponse.json(
      {
        error:
          "Server WebGIS tidak berhasil mengambil data dari Cloudflare R2.",
        detail: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
