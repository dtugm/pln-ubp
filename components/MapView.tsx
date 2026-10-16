"use client";

import { useEffect, useRef, useState } from "react";

import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

type DigitasiKey =
  | "bm" | "bangunan" | "jalan" | "kolam" | "lahan-terbuka"
  | "pagar" | "pipa-esdm" | "pipa-spp" | "rawa" | "rel-ka"
  | "selokan" | "sempadan-sungai" | "sungai" | "tangki"
  | "kontur-mayor" | "kontur-minor";

type DigitasiLayer = {
  key: DigitasiKey;
  label: string;
  file: string;
  color: string;
};

const R2_DATA_BASE = "https://pub-b1a30761571c4deda99b775a859ed84c.r2.dev/data";

const digitasiLayers: DigitasiLayer[] = [
  { key: "bangunan", label: "Bangunan", file: "Bangunan.geojson", color: "#d97745" },
  { key: "jalan", label: "Jalan", file: "Jalan.geojson", color: "#596873" },
  { key: "kolam", label: "Kolam", file: "Kolam.geojson", color: "#55b9d5" },
  { key: "lahan-terbuka", label: "Lahan Terbuka", file: "Lahan Terbuka.geojson", color: "#a6bd63" },
  { key: "pagar", label: "Pagar", file: "Pagar.geojson", color: "#c97868" },
  { key: "pipa-esdm", label: "Pipa ESDM", file: "Pipa ESDM.geojson", color: "#c77bb0" },
  { key: "pipa-spp", label: "Pipa SPP", file: "Pipa SPP.geojson", color: "#9b8acb" },
  { key: "rawa", label: "Rawa", file: "Rawa.geojson", color: "#55b895" },
  { key: "selokan", label: "Selokan", file: "Selokan.geojson", color: "#62b8d9" },
  { key: "sempadan-sungai", label: "Sempadan Sungai", file: "Sempadan Sungai.geojson", color: "#a66b43" },
  { key: "sungai", label: "Sungai", file: "Sungai.geojson", color: "#477fc4" },
  { key: "tangki", label: "Tangki", file: "Tangki.geojson", color: "#d97972" },
  { key: "kontur-mayor", label: "Kontur Mayor", file: "Kontur Mayor.geojson", color: "#8f4e32" },
  { key: "kontur-minor", label: "Kontur Minor", file: "Kontur Minor.geojson", color: "#b28a58" },
  { key: "rel-ka", label: "Rel KA", file: "Rel KA.geojson", color: "#242424" },
  { key: "bm", label: "BM", file: "BM.geojson", color: "#d6a84f" },
];

const digitasiGroups: { title: string; keys: DigitasiKey[] }[] = [
  { title: "Bangunan", keys: ["bangunan"] },
  { title: "Hipsografi", keys: ["kontur-mayor", "kontur-minor"] },
  { title: "Badan Air & Hidrologi", keys: ["sungai", "rawa", "kolam", "selokan"] },
  { title: "Transportasi", keys: ["jalan", "rel-ka"] },
  { title: "Objek Lainnya", keys: ["tangki"] },
  { title: "Jaringan Pipa", keys: ["pipa-esdm", "pipa-spp"] },
  { title: "Tutupan Lahan", keys: ["lahan-terbuka"] },
  { title: "Struktur", keys: ["pagar", "sempadan-sungai"] },
  { title: "Titik Kontrol Pemetaan", keys: ["bm"] },
];

const initialDigitasiLayers = Object.fromEntries(
  digitasiLayers.map((layer) => [layer.key, true])
) as Record<DigitasiKey, boolean>;


export default function MapView({ username, onLogout }: { username: string; onLogout: () => void }) {

  const mapContainer = useRef<HTMLDivElement>(null);

  const mapRef = useRef<MapLibreMap | null>(null);

  const [digitasiVisibility, setDigitasiVisibility] = useState<Record<DigitasiKey, boolean>>(initialDigitasiLayers);

  const [query, setQuery] = useState("");
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showBasemapPanel, setShowBasemapPanel] = useState(false);
  const [basemap, setBasemap] = useState<"osm" | "google">("osm");
  const [orthophotoOn, setOrthophotoOn] = useState(false);
  const [terrainOn, setTerrainOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(14.2);

  useEffect(() => {

    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({

      container: mapContainer.current,

      center: [110.435102,-6.954225],

      zoom: 14.2,
      maxZoom: 20,
      pitch: 0,
      bearing: 0,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https\://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap contributors"
          }
        },
        layers: [{ id: "osm-base", type: "raster", source: "osm", paint: { "raster-opacity": 0.92 } }]
      }
    });

    mapRef.current = map;
    setZoomLevel(map.getZoom());
    map.on("zoom", () => setZoomLevel(map.getZoom()));

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      // Gaya popup lembut mengikuti tema WebGIS; tanpa garis pemisah di bawah judul.
      if (!document.getElementById("soft-attribute-popup-styles")) {
        const popupStyle = document.createElement("style");
        popupStyle.id = "soft-attribute-popup-styles";
        popupStyle.textContent = `
          .maplibregl-popup.soft-attribute-popup .maplibregl-popup-content {
            padding: 8px 9px 7px;
            border-radius: 12px;
            background: rgba(255,255,255,0.98);
            box-shadow: 0 10px 32px rgba(39, 66, 82, 0.18), 0 2px 7px rgba(39, 66, 82, 0.08);
            border: 1px solid rgba(220, 232, 236, 0.9);
          }
          .maplibregl-popup.soft-attribute-popup .maplibregl-popup-close-button {
            top: 5px; right: 5px; width: 19px; height: 19px;
            border-radius: 50%; color: #466273; font-size: 13px;
            line-height: 17px; background: #eef5f7;
          }
          .maplibregl-popup.soft-attribute-popup .maplibregl-popup-close-button:hover {
            background: #e2eef1; color: #203e50;
          }
          .maplibregl-popup.soft-attribute-popup .maplibregl-popup-tip { border-top-color: #fff; }
        `;
        document.head.appendChild(popupStyle);
      }
      // Muat semua digitasi. Khusus Bangunan, konversi koordinat EPSG:3857
      // ke longitude/latitude karena file Bangunan.geojson berisi koordinat meter.
      const mercatorToLonLat = (position: any): any => {
        if (!Array.isArray(position)) return position;
        if (position.length >= 2 && typeof position[0] === "number" && typeof position[1] === "number") {
          const x = position[0];
          const y = position[1];
          const lon = (x / 20037508.342789244) * 180;
          const lat = (Math.atan(Math.sinh(y / 6378137)) * 180) / Math.PI;
          return [lon, lat, ...position.slice(2)];
        }
        return position.map(mercatorToLonLat);
      };

      // Konversi kontur jika GeoJSON ternyata menyimpan koordinat Web Mercator (EPSG:3857).
      // Jika koordinat sudah longitude/latitude, data dibiarkan apa adanya.
      const coordinatesLookProjected = (coordinates: any): boolean => {
        if (!Array.isArray(coordinates)) return false;
        if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
          return Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90;
        }
        for (const child of coordinates) {
          if (coordinatesLookProjected(child)) return true;
        }
        return false;
      };

      // Pola Rel KA hitam-putih berupa belang blok berulang, bukan arsiran silang.
      // Bar putih dan hitam vertikal bergantian menyerupai simbol pada legenda.
      const railPatternId = "rel-ka-black-white-pattern";
      if (!map.hasImage(railPatternId)) {
        const patternWidth = 32;
        const patternHeight = 12;
        const pixels = new Uint8Array(patternWidth * patternHeight * 4);
        for (let y = 0; y < patternHeight; y++) {
          for (let x = 0; x < patternWidth; x++) {
            // Belang lebih panjang: 8 px hitam lalu 8 px putih, berulang.
            const isWhite = (x % 16) >= 8;
            const offset = (y * patternWidth + x) * 4;
            const value = isWhite ? 255 : 36;
            pixels[offset] = value;
            pixels[offset + 1] = value;
            pixels[offset + 2] = value;
            pixels[offset + 3] = 255;
          }
        }
        map.addImage(railPatternId, { width: patternWidth, height: patternHeight, data: pixels }, { pixelRatio: 2 });
      }

      for (const item of digitasiLayers) {
        const sourceId = `digitasi-${item.key}-source`;
        const fillId = `digitasi-${item.key}-fill`;
        const lineId = `digitasi-${item.key}-line`;
        const pointId = `digitasi-${item.key}-point`;
        const dataUrl = `${R2_DATA_BASE}/${encodeURIComponent(item.file)}`;
        let sourceData: any = dataUrl;

        if (["bangunan", "kontur-mayor", "kontur-minor"].includes(item.key)) {
          try {
            const response = await fetch(dataUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status} saat mengambil ${item.file}`);
            const geojson = await response.json();
            const features = geojson.features ?? [];
            const shouldConvert = item.key === "bangunan" || features.some((feature: any) =>
              feature.geometry && coordinatesLookProjected(feature.geometry.coordinates)
            );
            if (shouldConvert) {
              geojson.features = features.map((feature: any) => {
                if (!feature.geometry) return feature;
                return {
                  ...feature,
                  geometry: {
                    ...feature.geometry,
                    coordinates: mercatorToLonLat(feature.geometry.coordinates),
                  },
                };
              });
            }
            sourceData = geojson;
            console.info(`[${item.label}] ${features.length} fitur dimuat${shouldConvert ? ' dan koordinat dikonversi dari EPSG:3857' : ''}. URL: ${dataUrl}`);
          } catch (error) {
            console.error(`[${item.label}] Gagal memuat GeoJSON. Periksa nama file dan URL R2:`, error);
            continue;
          }
        }

        map.addSource(sourceId, { type: "geojson", data: sourceData });

        map.addLayer({
          id: fillId,
          type: "fill",
          source: sourceId,
          // MapLibre menganggap MultiPolygon sebagai geometri Polygon untuk filter.
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            ...(item.key === "rel-ka"
              ? { "fill-pattern": "rel-ka-black-white-pattern" }
              : { "fill-color": item.color }),
            // Opacity diseimbangkan agar warna lebih tegas, tetapi basemap tetap terlihat.
            "fill-opacity":
              item.key === "bangunan" ? 0.80 :
              item.key === "rawa" ? 0.70 :
              item.key === "kolam" ? 0.65 :
              item.key === "lahan-terbuka" || item.key === "sempadan-sungai" ? 0.60 :
              0.72,
            "fill-outline-color": item.key === "bangunan" ? "#9f5638" : item.color,
          },
        });

        // Rel KA memakai dua garis bertumpuk: garis putih sebagai dasar,
        // lalu garis hitam putus-putus agar tampak seperti simbol rel.
        if (item.key === "rel-ka") {
          map.addLayer({
            id: `${lineId}-casing`,
            type: "line",
            source: sourceId,
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": "#ffffff",
              "line-width": 5.5,
              "line-opacity": 1,
            },
          });
        }

        map.addLayer({
          id: lineId,
          type: "line",
          source: sourceId,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": item.key === "bangunan" ? "#9f5638" : item.color,
            "line-width": item.key === "kontur-mayor" ? 1.8 : item.key === "kontur-minor" ? 1.0 : item.key === "bangunan" ? 1.6 : item.key === "rel-ka" ? 3.2 : 2.5,
            "line-opacity": item.key === "kontur-minor" ? 0.82 : item.key === "kontur-mayor" ? 0.95 : 0.95,
            ...(item.key === "rel-ka" ? { "line-dasharray": [0.7, 1.3] } : {}),
          },
        });

        map.addLayer({
          id: pointId,
          type: "circle",
          source: sourceId,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5.5,
            "circle-color": item.color,
            "circle-opacity": 0.90,
            "circle-stroke-color": "#17212b",
            "circle-stroke-opacity": 0.85,
            "circle-stroke-width": 1.2,
          },
        });

        // Popup atribut: tampilkan properti yang memang tersedia pada fitur GeoJSON.
        // Nilai di-escape agar teks atribut tidak dianggap sebagai HTML.
        const escapePopupHtml = (value: unknown): string =>
          String(value ?? "—")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");

        const popupLayerIds = [fillId, lineId, pointId];
        map.on("click", popupLayerIds, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;

          const properties = feature.properties ?? {};
          const entries = Object.entries(properties).filter(([, value]) => value !== null && value !== undefined && value !== "");
          const rows = entries.length
            ? entries.slice(0, 30).map(([key, value]) => {
                const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
                return `<div style="display:grid;grid-template-columns:minmax(62px,0.85fr) minmax(75px,1.15fr);gap:6px;padding:4px 6px;margin:2px 0;border-radius:7px;background:#f5f8f8;"><span style="color:#718096;overflow-wrap:anywhere;">${escapePopupHtml(key)}</span><strong style="font-weight:500;color:#284456;overflow-wrap:anywhere;">${escapePopupHtml(displayValue)}</strong></div>`;
              }).join("")
            : '<div style="padding:10px 0;color:#64748b;">Tidak ada atribut pada fitur ini.</div>';

          const popupHtml = `<div style="font-family:Arial,sans-serif;min-width:160px;max-width:240px;color:#1f2937;"><div style="font-size:12px;font-weight:700;padding:1px 1px 5px;margin-bottom:3px;color:#29485d;letter-spacing:-0.2px;">${escapePopupHtml(item.label)}</div><div style="max-height:180px;overflow:auto;font-size:10px;scrollbar-width:thin;">${rows}</div>${entries.length > 30 ? `<div style="font-size:10px;color:#718096;padding-top:5px;">Menampilkan 30 dari ${entries.length} atribut.</div>` : ""}</div>`;

          new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px", className: "soft-attribute-popup" })
            .setLngLat(event.lngLat)
            .setHTML(popupHtml)
            .addTo(map);
        });

        map.on("mouseenter", popupLayerIds, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", popupLayerIds, () => { map.getCanvas().style.cursor = ""; });
      }

      // Urutan gambar di peta: layer lain -> kontur -> Bangunan -> Rel KA -> BM.
      // Ini membuat kontur berada di bawah Bangunan tetapi tidak tertutup layer lainnya.
      const moveLayerSetToTop = (key: DigitasiKey, kinds: string[]) => {
        for (const kind of kinds) {
          const id = `digitasi-${key}-${kind}`;
          if (map.getLayer(id)) map.moveLayer(id);
        }
      };
      moveLayerSetToTop("kontur-mayor", ["fill", "line", "point"]);
      moveLayerSetToTop("kontur-minor", ["fill", "line", "point"]);
      moveLayerSetToTop("bangunan", ["fill", "line", "point"]);
      moveLayerSetToTop("rel-ka", ["fill", "line-casing", "line", "point"]);
      moveLayerSetToTop("bm", ["fill", "line", "point"]);
    });

    return () => { map.remove(); mapRef.current = null; };

  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    digitasiLayers.forEach((item) => {
      const visibility = digitasiVisibility[item.key] ? "visible" : "none";
      ["fill", "line-casing", "line", "point"].forEach((kind) => {
        const id = `digitasi-${item.key}-${kind}`;
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      });
    });
  }, [digitasiVisibility]);

  // Semua raster (basemap dan orthophoto) diletakkan sebelum layer digitasi pertama.
  // Dengan begitu urutannya: OSM/Satelit -> Orthophoto -> seluruh layer digitasi.
  function getFirstDigitasiLayerId(map: MapLibreMap): string | undefined {
    for (const item of digitasiLayers) {
      for (const kind of ["fill", "line", "point"]) {
        const id = `digitasi-${item.key}-${kind}`;
        if (map.getLayer(id)) return id;
      }
    }
    return undefined;
  }

  function changeBasemap(next: "osm" | "google") {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("idle", () => changeBasemap(next));
      return;
    }

    const googleSourceId = "google-satellite-source";
    const googleLayerId = "google-satellite-base";

    // Siapkan Satellite hanya saat pertama kali diperlukan.
    if (next === "google") {
      if (!map.getSource(googleSourceId)) {
        map.addSource(googleSourceId, {
          type: "raster",
          tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
          tileSize: 256,
          attribution: "Imagery © Google",
          minzoom: 0,
          maxzoom: 22,
        });
      }
      if (!map.getLayer(googleLayerId)) {
        map.addLayer({
          id: googleLayerId,
          type: "raster",
          source: googleSourceId,
          layout: { visibility: "none" },
          paint: { "raster-opacity": 1 },
        }, map.getLayer("orthophoto-base") ? "orthophoto-base" : getFirstDigitasiLayerId(map));
      }
    }

    // Basemap selalu tetap aktif di bawah Orthophoto.
    if (map.getLayer("osm-base")) {
      map.setLayoutProperty("osm-base", "visibility", next === "osm" ? "visible" : "none");
    }
    if (map.getLayer(googleLayerId)) {
      map.setLayoutProperty(googleLayerId, "visibility", next === "google" ? "visible" : "none");
    }

    setBasemap(next);
  }

  function toggleOrthophoto() {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("idle", toggleOrthophoto);
      return;
    }

    const tileUrl = process.env.NEXT_PUBLIC_ORTHOPHOTO_TILE_URL?.trim();
    if (!tileUrl) {
      alert("URL tile Orthophoto belum diatur. Isi NEXT_PUBLIC_ORTHOPHOTO_TILE_URL di .env.local dengan URL template XYZ, misalnya https://domain-publik/orthophoto/{z}/{x}/{y}.webp.");
      return;
    }

    const sourceId = "orthophoto-source";
    const layerId = "orthophoto-base";
    const turningOn = !orthophotoOn;

    if (turningOn) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "raster",
          tiles: [tileUrl],
          tileSize: 256,
          attribution: "Orthophoto PLN · Cloudflare R2",
          minzoom: 14,
          maxzoom: 22,
        });
      }
      if (!map.getLayer(layerId)) {
        // Orthophoto berada di atas basemap, tetapi di bawah jaringan/aset.
        map.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          layout: { visibility: "visible" },
          paint: { "raster-opacity": 0.82 },
        }, getFirstDigitasiLayerId(map));
      } else {
        map.setLayoutProperty(layerId, "visibility", "visible");
        map.setPaintProperty(layerId, "raster-opacity", 0.82);
      }
    } else if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }

    // Tidak mengubah center atau zoom; posisi pengguna tetap dipertahankan.
    setOrthophotoOn(turningOn);
  }

  function toggleTerrain() {

    const map = mapRef.current;

    if (!map) return;

    const tilejson = process.env.NEXT_PUBLIC_TERRAIN_TILEJSON_URL;

    if (!tilejson) {

      alert("Terrain 3D belum tersedia");

      return;

    }

    if (!terrainOn) {

      if (!map.getSource("terrain-dem")) {

        map.addSource("terrain-dem", { type: "raster-dem", url: tilejson, tileSize: 256, encoding: "mapbox" });

      }

      map.setTerrain({ source: "terrain-dem", exaggeration: 1.2 });

      map.easeTo({ pitch: 60, duration: 800 });

      setTerrainOn(true);

    } else {

      map.setTerrain(null);

      map.easeTo({ pitch: 0, duration: 800 });

      setTerrainOn(false);

    }

  }

  function search() {

    const map = mapRef.current;

    if (!map || !query.trim()) return;

    map.easeTo({ center: [110.4245, -6.9435], zoom: 16, duration: 600 });

    alert(`Pencarian "${query}" belum terhubung ke atribut GeoJSON.`);

  }

  return (

    <main className="app-shell">

      <header className="topbar">

        <div className="app-brand">

          <img

            src="/assets/logo-pln.webp"

            alt="Logo PLN"

            className="pln-logo"

          />

          <div className="brand-divider" />

          <div className="brand-copy"><strong>WebGIS TambakLorok</strong><span>Unit Pelaksana Proyek</span></div>

        </div>

        <form className="global-search" onSubmit={(e) => { e.preventDefault(); search(); }}>

          <span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari lokasi, alamat, atau aset..." />

          <button type="submit">Cari</button>

        </form>

        <div className="account"><div className="avatar">{username.slice(0, 2).toUpperCase()}</div><div className="account-copy"><strong>{username}</strong><span>Pengguna</span></div><button className="logout-button" onClick={onLogout}>Keluar</button></div>

      </header>

      <div className="main-layout main-layout-simple">
  <section className="map-area map-area-full">
    {!showLayerPanel && (
      <button
        type="button"
        className="floating-layer-button"
        onClick={() => setShowLayerPanel(true)}
        aria-expanded={false}
      >
        <span>▤</span>
        Layer
        <span className="layer-count">{Object.values(digitasiVisibility).filter(Boolean).length}</span>
      </button>
    )}

    {showLayerPanel && (
      <aside className="layer-panel floating-layer-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">KONTROL PETA</span>
            <h2>Layer Peta</h2>
          </div>
          <button
            type="button"
            className="close-layer-panel"
            onClick={() => setShowLayerPanel(false)}
            aria-label="Tutup panel layer"
          >
            ×
          </button>
        </div>

        <div className="layer-tabs">
          <button type="button" className="selected">Digitasi</button>
          <button
            type="button"
            onClick={toggleTerrain}
            className={terrainOn ? "terrain-active" : ""}
          >
            Terrain 3D
          </button>
        </div>

        <div className="layer-list-scroll">
          {/* <p className="section-label">LAYER DIGITASI</p> */}

          {digitasiGroups.map((group) => {
          const lineKeys: DigitasiKey[] = ["jalan", "pagar", "pipa-esdm", "pipa-spp", "rel-ka", "selokan", "sungai", "kontur-mayor", "kontur-minor"];
          const pointKeys: DigitasiKey[] = ["bm"];
          const orderedKeys = [...group.keys].sort((a, b) => {
            const rank = (key: DigitasiKey) => lineKeys.includes(key) ? 0 : pointKeys.includes(key) ? 2 : 1;
            return rank(a) - rank(b);
          });
          const isCollapsed = Boolean(collapsedGroups[group.title]);
          const activeCount = group.keys.filter((key) => digitasiVisibility[key]).length;
          return (
            <section key={group.title} className="digitasi-layer-group" style={{ marginBottom: 5 }}>
              <div
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 11px", minHeight: 36, boxSizing: "border-box",
                  background: "#f1f3f5", border: "1px solid #e1e5e9",
                  borderRadius: isCollapsed ? 9 : "9px 9px 0 0", color: "#334155",
                  transition: "background 160ms ease, border-color 160ms ease, border-radius 160ms ease"
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Aktifkan/nonaktifkan semua layer ${group.title}`}
                  checked={activeCount === group.keys.length}
                  ref={(element) => { if (element) element.indeterminate = activeCount > 0 && activeCount < group.keys.length; }}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setDigitasiVisibility((old) => {
                      const next = { ...old };
                      group.keys.forEach((key) => { next[key] = checked; });
                      return next;
                    });
                  }}
                  style={{ margin: 0, flexShrink: 0, cursor: "pointer" }}
                />
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((old) => ({ ...old, [group.title]: !old[group.title] }))}
                  aria-expanded={!isCollapsed}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9,
                    padding: 0, textAlign: "left", cursor: "pointer", border: 0, background: "transparent", color: "inherit" }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1, width: 14, color: "#64748b", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{isCollapsed ? "▸" : "▾"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{group.title}</span>
                  </span>
                  <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap", background: "#e5e9ed", borderRadius: 10, padding: "2px 6px" }}>{activeCount}/{group.keys.length}</span>
                </button>
              </div>
              {!isCollapsed && orderedKeys.map((key) => {
                const item = digitasiLayers.find((layer) => layer.key === key);
                if (!item) return null;
                return (
                  <label
                    className="layer-row"
                    key={item.key}
                    style={{ marginLeft: 12, width: "calc(100% - 12px)", boxSizing: "border-box", paddingLeft: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={digitasiVisibility[item.key]}
                      onChange={(e) => setDigitasiVisibility((old) => ({ ...old, [item.key]: e.target.checked }))}
                    />
                    <span
                      className={
                        item.key === "bm"
                          ? "geometry-symbol geometry-point"
                          : ["jalan", "pagar", "pipa-esdm", "pipa-spp", "rel-ka", "selokan", "sungai", "kontur-mayor", "kontur-minor"].includes(item.key)
                            ? "geometry-symbol geometry-line"
                            : "geometry-symbol geometry-polygon"
                      }
                      style={{
                        "--legend": item.color,
                        ...(["kontur-mayor", "kontur-minor"].includes(item.key) ? {
                          display: "inline-block", width: "30px", minWidth: "30px", height: item.key === "kontur-mayor" ? "3px" : "2px",
                          backgroundColor: item.color, borderRadius: "2px", flexShrink: 0,
                        } : {}),
                        ...(item.key === "rel-ka" ? {
                          // Paksa legenda menjadi strip hitam-putih yang terlihat,
                          // tidak mengikuti tinggi tipis dari class geometry-line.
                          display: "inline-block",
                          width: "30px",
                          minWidth: "30px",
                          height: "8px",
                          minHeight: "8px",
                          boxSizing: "border-box",
                          backgroundColor: "#ffffff",
                          backgroundImage: "repeating-linear-gradient(90deg, #242424 0 5px, #ffffff 5px 10px)",
                          border: "1px solid #242424",
                          borderRadius: "1px",
                          flexShrink: 0,
                        } : {}),
                      } as React.CSSProperties}
                      aria-label={item.key === "rel-ka" ? "Garis rel hitam putih" : item.key === "bm" ? "Titik" : ["jalan", "pagar", "pipa-esdm", "pipa-spp", "rel-ka", "selokan", "sungai", "kontur-mayor", "kontur-minor"].includes(item.key) ? "Garis" : "Poligon"}
                    />
                    <span className="layer-name">{item.label}</span>
                  </label>
                );
              })}
            </section>
          );
          })}
        </div>

        {/* <div className="panel-bottom">
          <span className="status-dot" /> Peta dasar OpenStreetMap
        </div> */}
      </aside>
    )}

    <div ref={mapContainer} className="map-container" />

    <div
      aria-live="polite"
      className="zoom-level-indicator"
      style={{
        position: "absolute",
        left: "16px",
        bottom: "42px",
        zIndex: 20,
        padding: "7px 11px",
        borderRadius: "8px",
        background: "rgba(255, 255, 255, 0.94)",
        color: "#596873",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
        fontSize: "12px",
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      Zoom: <strong>{zoomLevel.toFixed(2)}</strong>
    </div>

    <div className="map-tools-stack">
      <div className="basemap-control">
        <button
          type="button"
          className="basemap-card-toggle"
          onClick={() => setShowBasemapPanel((open) => !open)}
          aria-expanded={showBasemapPanel}
          aria-label="Pilih basemap"
        >
          <span className={`basemap-card-preview ${basemap === "google" ? "is-satellite" : "is-street"}`} aria-hidden="true">
            <span className="preview-water" />
            <span className="preview-road preview-road-one" />
            <span className="preview-road preview-road-two" />
            <span className="preview-road preview-road-three" />
            <span className="preview-block preview-block-one" />
            <span className="preview-block preview-block-two" />
          </span>
          <span className="basemap-card-label">Basemap</span>
        </button>
        {showBasemapPanel && (
          <div className="basemap-options">
            <button type="button" className={basemap === "osm" ? "basemap-option active" : "basemap-option"} onClick={() => changeBasemap("osm")}>
              <span className="basemap-preview basemap-preview-street" />
              <span>OpenStreetMap</span>
            </button>
            <button type="button" className={basemap === "google" ? "basemap-option active" : "basemap-option"} onClick={() => changeBasemap("google")}>
              <span className="basemap-preview basemap-preview-satellite" />
              <span>Satellite</span>
            </button>
            <button type="button" className={orthophotoOn ? "basemap-option active" : "basemap-option"} onClick={toggleOrthophoto}>
              <span className="basemap-preview basemap-preview-orthophoto" />
              <span>Orthophoto</span>
            </button>
          </div>
        )}
      </div>

    </div>

    <div className="stats-strip">
      <div><span>Jumlah Data</span><strong>{digitasiLayers.length}</strong></div>
      <div><span>Layer aktif</span><strong>{digitasiLayers.filter((item) => digitasiVisibility[item.key]).length}</strong></div>
      {/* <div><span>Sumber data</span><strong>Cloudflare R2</strong></div> */}
    </div>
  </section>
</div>

    </main>

  );

}
