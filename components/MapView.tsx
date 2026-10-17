"use client";

import { useEffect, useRef, useState } from "react";

import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";

type DigitasiKey =
  | "bm"
  | "bangunan"
  | "jalan"
  | "kolam"
  | "lahan-terbuka"
  | "pagar"
  | "pipa-esdm"
  | "pipa-spp"
  | "rawa"
  | "rel-ka"
  | "selokan"
  | "sempadan-sungai"
  | "sungai"
  | "tangki"
  | "kontur-mayor"
  | "kontur-minor";

type DigitasiLayer = {
  key: DigitasiKey;

  label: string;

  file: string;

  color: string;
};


type OSMSearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
};

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_value?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

const R2_DATA_BASE = "/api/data";

const digitasiLayers: DigitasiLayer[] = [
  {
    key: "bangunan",
    label: "Bangunan",
    file: "Bangunan.geojson",
    color: "#d97745",
  },

  { key: "jalan", label: "Jalan", file: "Jalan.geojson", color: "#596873" },

  { key: "kolam", label: "Kolam", file: "Kolam.geojson", color: "#55b9d5" },

  {
    key: "lahan-terbuka",
    label: "Lahan Terbuka",
    file: "Lahan Terbuka.geojson",
    color: "#a6bd63",
  },

  { key: "pagar", label: "Pagar", file: "Pagar.geojson", color: "#c97868" },

  {
    key: "pipa-esdm",
    label: "Pipa ESDM",
    file: "Pipa ESDM.geojson",
    color: "#c77bb0",
  },

  {
    key: "pipa-spp",
    label: "Pipa SPP",
    file: "Pipa SPP.geojson",
    color: "#9b8acb",
  },

  { key: "rawa", label: "Rawa", file: "Rawa.geojson", color: "#55b895" },

  {
    key: "selokan",
    label: "Selokan",
    file: "Selokan.geojson",
    color: "#62b8d9",
  },

  {
    key: "sempadan-sungai",
    label: "Sempadan Sungai",
    file: "Sempadan Sungai.geojson",
    color: "#a66b43",
  },

  { key: "sungai", label: "Sungai", file: "Sungai.geojson", color: "#477fc4" },

  { key: "tangki", label: "Tangki", file: "Tangki.geojson", color: "#d97972" },

  {
    key: "kontur-mayor",
    label: "Kontur Mayor",
    file: "Kontur Mayor.geojson",
    color: "#8f4e32",
  },

  {
    key: "kontur-minor",
    label: "Kontur Minor",
    file: "Kontur Minor.geojson",
    color: "#b28a58",
  },

  { key: "rel-ka", label: "Rel KA", file: "Rel KA.geojson", color: "#242424" },

  { key: "bm", label: "BM", file: "BM.geojson", color: "#d6a84f" },
];

const digitasiGroups: { title: string; keys: DigitasiKey[] }[] = [
  { title: "Bangunan", keys: ["bangunan"] },

  { title: "Hipsografi", keys: ["kontur-mayor", "kontur-minor"] },

  {
    title: "Badan Air & Hidrologi",
    keys: ["sungai", "rawa", "kolam", "selokan"],
  },

  { title: "Transportasi", keys: ["jalan", "rel-ka"] },

  { title: "Objek Lainnya", keys: ["tangki"] },

  { title: "Jaringan Pipa", keys: ["pipa-esdm", "pipa-spp"] },

  { title: "Tutupan Lahan", keys: ["lahan-terbuka"] },

  { title: "Struktur", keys: ["pagar", "sempadan-sungai"] },

  { title: "Titik Kontrol Pemetaan", keys: ["bm"] },
];

const initialDigitasiLayers = Object.fromEntries(
  digitasiLayers.map((layer) => [
    layer.key,
    !["kontur-mayor", "kontur-minor", "bm"].includes(layer.key),
  ]),
) as Record<DigitasiKey, boolean>;

export default function MapView({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);

  const mapRef = useRef<MapLibreMap | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [digitasiVisibility, setDigitasiVisibility] = useState<
    Record<DigitasiKey, boolean>
  >(initialDigitasiLayers);

  const [query, setQuery] = useState("");

  const [searchResults, setSearchResults] = useState<OSMSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchMarkerRef = useRef<Marker | null>(null);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);

  const [showLayerPanel, setShowLayerPanel] = useState(false);

  const [zoomingLayer, setZoomingLayer] = useState<DigitasiKey | null>(null);

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const [showBasemapPanel, setShowBasemapPanel] = useState(false);

  const [showStatsPanel, setShowStatsPanel] = useState(true);

  const [basemap, setBasemap] = useState<"osm" | "google" | "none">("osm");

  const [orthophotoOn, setOrthophotoOn] = useState(false);

  const [terrainOn, setTerrainOn] = useState(false);
  const [activeLayerTab, setActiveLayerTab] = useState<"data" | "terrain">("data");
  const [activeTerrain, setActiveTerrain] = useState<"aws" | "dtm" | null>(null);

  const [zoomLevel, setZoomLevel] = useState(14.2);

  // Tutup menu profil ketika pengguna mengetuk area di luar menu.
  useEffect(() => {
    if (!showProfileMenu) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showProfileMenu]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,

      // Attribution starts collapsed; users can open it using the info button.
      attributionControl: { compact: true },

      center: [110.435102, -6.9575],

      zoom: 14.2,

      maxZoom: 22,

      pitch: 0,

      bearing: 0,

      style: {
        version: 8,

        sources: {
          osm: {
            type: "raster",

            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],

            tileSize: 256,

            attribution: "&copy; OpenStreetMap contributors",
          },
        },

        layers: [
          {
            id: "osm-base",
            type: "raster",
            source: "osm",
            paint: { "raster-opacity": 0.92 },
          },
        ],
      },
    });

    mapRef.current = map;

    setZoomLevel(map.getZoom());

    map.on("zoom", () => setZoomLevel(map.getZoom()));

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );

    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );

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

          /* Kontrol zoom diposisikan oleh global.css agar tidak bertabrakan dengan skala. */
          .map-area-full .maplibregl-ctrl-bottom-right .maplibregl-ctrl-group {
            transform: none;
          }

        `;

        document.head.appendChild(popupStyle);
      }

      // Muat semua digitasi. Khusus Bangunan, konversi koordinat EPSG:3857

      // ke longitude/latitude karena file Bangunan.geojson berisi koordinat meter.

      const mercatorToLonLat = (position: any): any => {
        if (!Array.isArray(position)) return position;

        if (
          position.length >= 2 &&
          typeof position[0] === "number" &&
          typeof position[1] === "number"
        ) {
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

        if (
          coordinates.length >= 2 &&
          typeof coordinates[0] === "number" &&
          typeof coordinates[1] === "number"
        ) {
          return (
            Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90
          );
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

            const isWhite = x % 16 >= 8;

            const offset = (y * patternWidth + x) * 4;

            const value = isWhite ? 255 : 36;

            pixels[offset] = value;

            pixels[offset + 1] = value;

            pixels[offset + 2] = value;

            pixels[offset + 3] = 255;
          }
        }

        map.addImage(
          railPatternId,
          { width: patternWidth, height: patternHeight, data: pixels },
          { pixelRatio: 2 },
        );
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

            if (!response.ok)
              throw new Error(
                `HTTP ${response.status} saat mengambil ${item.file}`,
              );

            const geojson = await response.json();

            const features = geojson.features ?? [];

            const shouldConvert =
              item.key === "bangunan" ||
              features.some(
                (feature: any) =>
                  feature.geometry &&
                  coordinatesLookProjected(feature.geometry.coordinates),
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

            console.info(
              `[${item.label}] ${features.length} fitur dimuat${shouldConvert ? " dan koordinat dikonversi dari EPSG:3857" : ""}. URL: ${dataUrl}`,
            );
          } catch (error) {
            console.error(
              `[${item.label}] Gagal memuat GeoJSON. Periksa nama file dan URL R2:`,
              error,
            );

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

            // Semua poligon dibuat sedikit transparan agar basemap tetap terlihat.
            "fill-opacity": 0.8,

            "fill-outline-color":
              item.key === "rel-ka"
                ? "#ffffff"
                : item.key === "bangunan"
                  ? "#8b3f1f"
                  : item.color,
          },
        });

        // Outline khusus poligon bangunan agar batas antarbangunan lebih tegas.
        if (item.key === "bangunan") {
          map.addLayer({
            id: `${lineId}-polygon-outline`,
            type: "line",
            source: sourceId,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "line-color": "#8b3f1f",
              "line-width": 1.8,
              "line-opacity": 1,
            },
          });
        }

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
            "line-color": item.key === "rel-ka" ? "#242424" : item.color,

            "line-width":
              item.key === "kontur-mayor"
                ? 1.8
                : item.key === "kontur-minor"
                  ? 1.0
                  : item.key === "bangunan"
                    ? 1.6
                    : item.key === "rel-ka"
                      ? 3.2
                      : 2.5,

            "line-opacity": 1,

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

            "circle-opacity": 1,

            "circle-stroke-color": "#17212b",

            "circle-stroke-opacity": 1,

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

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#039;");

        const popupLayerIds = [fillId, lineId, pointId];

        map.on("click", popupLayerIds, (event) => {
          const feature = event.features?.[0];

          if (!feature) return;

          const properties = feature.properties ?? {};

          const entries = Object.entries(properties).filter(
            ([, value]) =>
              value !== null && value !== undefined && value !== "",
          );

          const rows = entries.length
            ? entries
                .slice(0, 30)
                .map(([key, value]) => {
                  const displayValue =
                    typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value);

                  return `<div style="display:grid;grid-template-columns:minmax(62px,0.85fr) minmax(75px,1.15fr);gap:6px;padding:4px 6px;margin:2px 0;border-radius:7px;background:#f5f8f8;"><span style="color:#718096;overflow-wrap:anywhere;">${escapePopupHtml(key)}</span><strong style="font-weight:500;color:#284456;overflow-wrap:anywhere;">${escapePopupHtml(displayValue)}</strong></div>`;
                })
                .join("")
            : '<div style="padding:10px 0;color:#64748b;">Tidak ada atribut pada fitur ini.</div>';

          const popupHtml = `<div style="font-family:Arial,sans-serif;min-width:160px;max-width:240px;color:#1f2937;"><div style="font-size:12px;font-weight:700;padding:1px 1px 5px;margin-bottom:3px;color:#29485d;letter-spacing:-0.2px;">${escapePopupHtml(item.label)}</div><div style="max-height:180px;overflow:auto;font-size:10px;scrollbar-width:thin;">${rows}</div>${entries.length > 30 ? `<div style="font-size:10px;color:#718096;padding-top:5px;">Menampilkan 30 dari ${entries.length} atribut.</div>` : ""}</div>`;

          new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: "260px",
            className: "soft-attribute-popup",
          })

            .setLngLat(event.lngLat)

            .setHTML(popupHtml)

            .addTo(map);
        });

        map.on("mouseenter", popupLayerIds, () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", popupLayerIds, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      // Terapkan visibilitas awal langsung ke layer MapLibre setelah semuanya dibuat.
      // Efek React yang mengatur visibility bisa berjalan sebelum layer selesai dimuat,
      // sehingga layer Kontur dan BM perlu disembunyikan juga pada saat inisialisasi peta.
      for (const key of [
        "kontur-mayor",
        "kontur-minor",
        "bm",
      ] as DigitasiKey[]) {
        const prefix = `digitasi-${key}-`;
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.id.startsWith(prefix)) {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
      }

      // Urutan render: semua fill di bawah, kemudian casing/garis, lalu titik.
      // Ini membantu menjaga Jalan, Pagar, Sungai, Selokan, Pipa, Kontur,
      // dan simbol titik tetap terlihat di atas poligon digitasi.
      const orderedKinds: Array<"fill" | "line-casing" | "line" | "point"> = [
        "fill",
        "line-casing",
        "line",
        "point",
      ];
      for (const kind of orderedKinds) {
        for (const item of digitasiLayers) {
          if (kind === "line-casing" && item.key !== "rel-ka") continue;
          const id = `digitasi-${item.key}-${kind}`;
          if (map.getLayer(id)) map.moveLayer(id);
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pastikan MapLibre menghitung ulang ukuran kanvas ketika viewport berubah,
  // panel/toolbar berubah ukuran, atau perangkat beralih orientasi.
  useEffect(() => {
    const container = mapContainer.current;
    const map = mapRef.current;
    if (!container || !map) return;

    let frame = 0;
    const resizeMap = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.resize();
      });
    };

    const observer = new ResizeObserver(resizeMap);
    observer.observe(container);
    window.addEventListener("resize", resizeMap, { passive: true });
    window.addEventListener("orientationchange", resizeMap, { passive: true });
    resizeMap();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeMap);
      window.removeEventListener("orientationchange", resizeMap);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !map.isStyleLoaded()) return;

    digitasiLayers.forEach((item) => {
      const visibility = digitasiVisibility[item.key] ? "visible" : "none";

      ["fill", "line-casing", "line", "point"].forEach((kind) => {
        const id = `digitasi-${item.key}-${kind}`;

        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", visibility);
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

  function changeBasemap(next: "osm" | "google" | "none") {
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
        map.addLayer(
          {
            id: googleLayerId,

            type: "raster",

            source: googleSourceId,

            layout: { visibility: "none" },

            paint: { "raster-opacity": 1 },
          },
          map.getLayer("orthophoto-base")
            ? "orthophoto-base"
            : getFirstDigitasiLayerId(map),
        );
      }
    }

    // Basemap selalu tetap aktif di bawah Orthophoto.

    if (map.getLayer("osm-base")) {
      map.setLayoutProperty(
        "osm-base",
        "visibility",
        next === "osm" ? "visible" : "none",
      );
    }

    if (map.getLayer(googleLayerId)) {
      map.setLayoutProperty(
        googleLayerId,
        "visibility",
        next === "google" ? "visible" : "none",
      );
    }

    // "Nonaktifkan basemap" juga mematikan overlay Orthophoto,
    // karena tombol ini dimaksudkan untuk membersihkan semua raster dasar.
    if (next === "none") {
      if (map.getLayer("orthophoto-base")) {
        map.setLayoutProperty("orthophoto-base", "visibility", "none");
      }
      setOrthophotoOn(false);
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

    // Gunakan route internal agar browser tidak meminta tile langsung ke R2.
    // Route server mengambil tile asli dari Cloudflare R2.
    const tileUrl = "/api/orthophoto/{z}/{x}/{y}.webp";

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

        map.addLayer(
          {
            id: layerId,

            type: "raster",

            source: sourceId,

            layout: { visibility: "visible" },

            paint: { "raster-opacity": 0.82 },
          },
          getFirstDigitasiLayerId(map),
        );
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

  function activateTerrain(kind: "aws" | "dtm" | null) {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("idle", () => activateTerrain(kind));
      return;
    }

    // Pilihan Off mematikan relief 3D tanpa mengubah basemap atau layer digitasi.
    if (kind === null) {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 700 });
      setTerrainOn(false);
      setActiveTerrain(null);
      return;
    }

    const sourceId = kind === "aws" ? "terrain-dem-aws" : "terrain-dem-dtm";
    const dtmTileJSON = process.env.NEXT_PUBLIC_DTM_TERRAIN_TILEJSON_URL?.trim();
    const dtmEncoding = process.env.NEXT_PUBLIC_DTM_TERRAIN_ENCODING?.trim() || "mapbox";

    if (kind === "dtm" && !dtmTileJSON) {
      window.alert(
        "DTM Lokal belum dikonfigurasi. Isi NEXT_PUBLIC_DTM_TERRAIN_TILEJSON_URL di .env.local dengan URL TileJSON DEM lokal. Pastikan tile DTM sudah dikodekan sebagai Terrain RGB (mapbox) atau Terrarium.",
      );
      return;
    }

    try {
      if (!map.getSource(sourceId)) {
        if (kind === "aws") {
          // AWS Terrain Tiles menggunakan encoding Terrarium.
          map.addSource(sourceId, {
            type: "raster-dem",
            tiles: [
              "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            encoding: "terrarium",
            minzoom: 0,
            maxzoom: 15,
            attribution: "Elevation data: AWS Terrain Tiles",
          });
        } else {
          map.addSource(sourceId, {
            type: "raster-dem",
            url: dtmTileJSON,
            tileSize: 256,
            encoding: dtmEncoding === "terrarium" ? "terrarium" : "mapbox",
          });
        }
      }

      map.setTerrain({ source: sourceId, exaggeration: 1.2 });
      map.easeTo({ pitch: 60, duration: 800 });
      setTerrainOn(true);
      setActiveTerrain(kind);
    } catch (error) {
      console.error(`Gagal mengaktifkan terrain ${kind}:`, error);
      window.alert(
        kind === "aws"
          ? "AWS Terrarium gagal diaktifkan. Periksa koneksi internet dan Console browser."
          : "DTM Lokal gagal diaktifkan. Periksa URL TileJSON, encoding DEM, dan Console browser.",
      );
    }
  }

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    setSearchResults([]);
    setSearchError("");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({
          q: term,
          limit: "6",
          lat: "-6.9575",
          lon: "110.435102",
        });
        const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          // Photon public server may reject unsupported query parameters/languages.
          throw new Error(`Photon API mengembalikan HTTP ${response.status}`);
        }
        const data = (await response.json()) as { features?: PhotonFeature[] };
        const results: OSMSearchResult[] = (data.features ?? []).flatMap((feature, index) => {
          const coords = feature.geometry?.coordinates;
          const props = feature.properties ?? {};
          if (!coords || coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return [];
          const title = props.name || props.street || "Lokasi";
          const address = [
            props.housenumber && props.street ? `${props.housenumber} ${props.street}` : (!props.housenumber ? props.street : undefined),
            props.district,
            props.city,
            props.county,
            props.state,
            props.country,
          ].filter((part, i, arr): part is string => Boolean(part) && arr.indexOf(part) === i).join(", ");
          const displayName = address && !address.toLowerCase().includes(title.toLowerCase())
            ? `${title}, ${address}`
            : (address ? `${title}, ${address}` : title);
          return [{ place_id: index + 1, display_name: displayName, lat: String(coords[1]), lon: String(coords[0]), type: props.osm_value }];
        });
        setSearchResults(results);
        setSearchError(results.length ? "" : `Belum ada hasil untuk “${term}”. Coba nama jalan, gedung, atau tempat yang lebih spesifik.`);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Pencarian Photon gagal:", error);
          setSearchResults([]);
          setSearchError(
            error instanceof Error && error.message.includes("HTTP")
              ? `Layanan pencarian sedang menolak permintaan (${error.message}). Coba lagi sebentar.`
              : "Saran lokasi belum berhasil dimuat. Periksa koneksi internet lalu coba lagi.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function zoomToDigitasiLayer(item: DigitasiLayer) {
    const map = mapRef.current;
    if (!map || zoomingLayer === item.key) return;

    setZoomingLayer(item.key);
    try {
      const url = `${R2_DATA_BASE}/${encodeURIComponent(item.file)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} saat mengambil ${item.file}`);
      }

      const geojson = await response.json();
      const features = Array.isArray(geojson.features)
        ? geojson.features
        : geojson.type === "Feature"
          ? [geojson]
          : [];

      const positions: number[][] = [];
      const collectPositions = (value: any): void => {
        if (!Array.isArray(value)) return;
        if (
          value.length >= 2 &&
          typeof value[0] === "number" &&
          typeof value[1] === "number"
        ) {
          positions.push([value[0], value[1]]);
          return;
        }
        value.forEach(collectPositions);
      };

      for (const feature of features) {
        if (feature?.geometry?.coordinates) {
          collectPositions(feature.geometry.coordinates);
        } else if (feature?.geometry?.geometries) {
          collectPositions(feature.geometry.geometries);
        }
      }

      if (!positions.length) {
        throw new Error(`Tidak ditemukan koordinat pada ${item.file}`);
      }

      const looksProjected = positions.some(
        ([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90,
      );
      const shouldConvert =
        item.key === "bangunan" ||
        ((item.key === "kontur-mayor" || item.key === "kontur-minor") &&
          looksProjected);

      const lonLatPositions = positions.map(([x, y]) => {
        if (!shouldConvert || !looksProjected) return [x, y];
        const lon = (x / 20037508.342789244) * 180;
        const lat = (Math.atan(Math.sinh(y / 6378137)) * 180) / Math.PI;
        return [lon, lat];
      });

      const longitudes = lonLatPositions.map(([lon]) => lon).filter(Number.isFinite);
      const latitudes = lonLatPositions.map(([, lat]) => lat).filter(Number.isFinite);
      if (!longitudes.length || !latitudes.length) {
        throw new Error(`Koordinat ${item.label} tidak valid`);
      }

      const minLon = longitudes.reduce((min, value) => Math.min(min, value), Infinity);
      const maxLon = longitudes.reduce((max, value) => Math.max(max, value), -Infinity);
      const minLat = latitudes.reduce((min, value) => Math.min(min, value), Infinity);
      const maxLat = latitudes.reduce((max, value) => Math.max(max, value), -Infinity);

      // Aktifkan layer agar hasil zoom langsung terlihat di peta.
      setDigitasiVisibility((old) => ({ ...old, [item.key]: true }));
      const prefix = `digitasi-${item.key}-`;
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.id.startsWith(prefix)) {
          map.setLayoutProperty(layer.id, "visibility", "visible");
        }
      }

      if (Math.abs(maxLon - minLon) < 0.00001 && Math.abs(maxLat - minLat) < 0.00001) {
        map.flyTo({ center: [minLon, minLat], zoom: 17, duration: 900 });
      } else {
        map.fitBounds(
          [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
          { padding: { top: 90, right: 90, bottom: 90, left: 90 }, maxZoom: 18, duration: 900 },
        );
      }
    } catch (error) {
      console.error(`Gagal zoom ke layer ${item.label}:`, error);
      window.alert(`Belum bisa zoom ke ${item.label}. Periksa koneksi dan file GeoJSON layer tersebut.`);
    } finally {
      setZoomingLayer(null);
    }
  }

  function search() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchError("Masukkan nama lokasi, jalan, alamat, atau tempat.");
      setShowSearchSuggestions(true);
      return;
    }
    if (searchResults.length > 0) {
      selectSearchResult(searchResults[0]);
    } else if (trimmedQuery.length < 3) {
      setSearchError("Ketik minimal 3 karakter untuk melihat saran lokasi.");
      setShowSearchSuggestions(true);
    } else {
      setShowSearchSuggestions(true);
    }
  }

  function selectSearchResult(result: OSMSearchResult) {
    const map = mapRef.current;
    if (!map) return;

    const longitude = Number(result.lon);
    const latitude = Number(result.lat);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    searchMarkerRef.current?.remove();
    searchMarkerRef.current = new maplibregl.Marker({ color: "#168aad" })
      .setLngLat([longitude, latitude])
      .setPopup(
        new maplibregl.Popup({ offset: 26, maxWidth: "280px" }).setText(
          result.display_name,
        ),
      )
      .addTo(map);

    map.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(map.getZoom(), 16),
      duration: 1000,
    });
    searchMarkerRef.current.togglePopup();
    setQuery(result.display_name.split(",")[0] || result.display_name);
    setSearchResults([]);
    setSearchError("");
    setShowSearchSuggestions(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar" style={{ position: "relative", zIndex: 5000 }}> 
        <div className="app-brand">
          <img
            src="/assets/logo-pln.webp"
            alt="Logo PLN"
            className="pln-logo"
          />

          <div className="brand-divider" />

          <div className="brand-copy">
            <strong>WebGIS TambakLorok</strong>
            <span>Unit Pelaksana Proyek</span>
          </div>
        </div>

        <form
          className="global-search"
          style={{ position: "relative" }}
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchError("");
              setShowSearchSuggestions(true);
            }}
            onFocus={() => { if (query.trim().length >= 3) setShowSearchSuggestions(true); }}
            placeholder="Cari lokasi, alamat, atau tempat..."
            aria-label="Cari lokasi, alamat, atau tempat"
            autoComplete="off"
          />

          <button type="submit" disabled={searchLoading}>
            {searchLoading ? "Mencari..." : "Cari"}
          </button>

          {showSearchSuggestions && query.trim().length >= 3 && (searchLoading || searchError || searchResults.length > 0) && (
            <div
              role="status"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                zIndex: 1001,
                padding: searchResults.length > 0 ? 6 : "12px 14px",
                border: "1px solid #d9e5e9",
                borderRadius: 12,
                background: "rgba(255,255,255,0.98)",
                boxShadow: "0 8px 24px rgba(24,57,70,0.16)",
                color: "#466273",
                fontSize: 12,
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {searchLoading && <div style={{ padding: 7 }}>Mencari saran lokasi…</div>}
              {!searchLoading && searchError && (
                <div style={{ padding: 7, lineHeight: 1.45 }}>{searchError}</div>
              )}
              {!searchLoading && searchResults.map((result) => (
                <button
                  key={result.place_id}
                  type="button"
                  onClick={() => selectSearchResult(result)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "9px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#29485d",
                    textAlign: "left",
                    cursor: "pointer",
                    lineHeight: 1.4,
                    fontSize: 12,
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "#eef7f9"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "block", fontWeight: 600, marginBottom: 2 }}>
                    {result.display_name.split(",")[0] || result.display_name}
                  </span>
                  <span style={{ display: "block", color: "#718096", fontSize: 11 }}>
                    {result.display_name}
                  </span>
                </button>
              ))}
              <div style={{ padding: "5px 8px 3px", color: "#81919b", fontSize: 10 }}>
                Saran lokasi: Photon · © OpenStreetMap contributors
              </div>
            </div>
          )}
        </form>

        <div className="account" ref={accountRef} style={{ position: "relative", zIndex: 5001 }}>
          <button
            type="button"
            className="avatar"
            aria-label="Buka menu profil dan keluar"
            aria-haspopup="menu"
            aria-expanded={showProfileMenu}
            onClick={() => setShowProfileMenu((open) => !open)}
            style={{ border: 0, padding: 0, cursor: "pointer", flexShrink: 0 }}
          >
            {username.slice(0, 2).toUpperCase()}
          </button>
          <div className="account-copy">
            <strong>{username}</strong>
            <span>Pengguna</span>
          </div>
          <button className="logout-button" onClick={onLogout}>
            Keluar
          </button>

          {showProfileMenu && (
            <div
              role="menu"
              aria-label="Menu profil"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                zIndex: 99999,
                width: 190,
                padding: 12,
                border: "1px solid #d9e5e9",
                borderRadius: 12,
                background: "rgba(255,255,255,0.99)",
                boxShadow: "0 8px 24px rgba(24,57,70,0.18)",
                color: "#173f50",
              }}
            >
              <div style={{ padding: "2px 4px 10px", borderBottom: "1px solid #e7eef1", marginBottom: 9 }}>
                <strong style={{ display: "block", fontSize: 12, overflowWrap: "anywhere" }}>{username}</strong>
                <span style={{ display: "block", marginTop: 3, color: "#78909a", fontSize: 11 }}>Pengguna</span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "9px 10px",
                  border: "1px solid #e2eaee",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#29485d",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Keluar
              </button>
            </div>
          )}
        </div>
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
              <span className="layer-count">
                {Object.values(digitasiVisibility).filter(Boolean).length}
              </span>
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
                <button
                  type="button"
                  className={activeLayerTab === "data" ? "selected" : ""}
                  onClick={() => setActiveLayerTab("data")}
                  aria-pressed={activeLayerTab === "data"}
                >
                  Data
                </button>

                <button
                  type="button"
                  className={activeLayerTab === "terrain" ? "selected" : ""}
                  onClick={() => setActiveLayerTab("terrain")}
                  aria-pressed={activeLayerTab === "terrain"}
                >
                  Terrain 3D
                </button>
              </div>

              <div className="layer-list-scroll">
                {activeLayerTab === "data" ? (
                  <>
                {/* <p className="section-label">LAYER DIGITASI</p> */}

                {digitasiGroups.map((group) => {
                  const lineKeys: DigitasiKey[] = [
                    "jalan",
                    "pagar",
                    "pipa-esdm",
                    "pipa-spp",
                    "rel-ka",
                    "selokan",
                    "sungai",
                    "kontur-mayor",
                    "kontur-minor",
                  ];

                  const pointKeys: DigitasiKey[] = ["bm"];

                  const orderedKeys = [...group.keys].sort((a, b) => {
                    const rank = (key: DigitasiKey) =>
                      lineKeys.includes(key)
                        ? 0
                        : pointKeys.includes(key)
                          ? 2
                          : 1;

                    return rank(a) - rank(b);
                  });

                  const isCollapsed = Boolean(collapsedGroups[group.title]);

                  const activeCount = group.keys.filter(
                    (key) => digitasiVisibility[key],
                  ).length;

                  return (
                    <section
                      key={group.title}
                      className="digitasi-layer-group"
                      style={{ marginBottom: 5 }}
                    >
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 9,

                          padding: "7px 11px",
                          minHeight: 36,
                          boxSizing: "border-box",

                          background: "#f1f3f5",
                          border: "1px solid #e1e5e9",

                          borderRadius: isCollapsed ? 9 : "9px 9px 0 0",
                          color: "#334155",

                          transition:
                            "background 160ms ease, border-color 160ms ease, border-radius 160ms ease",
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Aktifkan/nonaktifkan semua layer ${group.title}`}
                          checked={activeCount === group.keys.length}
                          ref={(element) => {
                            if (element)
                              element.indeterminate =
                                activeCount > 0 &&
                                activeCount < group.keys.length;
                          }}
                          onChange={(event) => {
                            const checked = event.target.checked;

                            setDigitasiVisibility((old) => {
                              const next = { ...old };

                              group.keys.forEach((key) => {
                                next[key] = checked;
                              });

                              return next;
                            });
                          }}
                          style={{
                            margin: 0,
                            flexShrink: 0,
                            cursor: "pointer",
                          }}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroups((old) => ({
                              ...old,
                              [group.title]: !old[group.title],
                            }))
                          }
                          aria-expanded={!isCollapsed}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 9,

                            padding: 0,
                            textAlign: "left",
                            cursor: "pointer",
                            border: 0,
                            background: "transparent",
                            color: "inherit",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 15,
                              lineHeight: 1,
                              width: 14,
                              color: "#64748b",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isCollapsed ? "▸" : "▾"}
                          </span>

                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              {group.title}
                            </span>
                          </span>

                          <span
                            style={{
                              fontSize: 10,
                              color: "#64748b",
                              whiteSpace: "nowrap",
                              background: "#e5e9ed",
                              borderRadius: 10,
                              padding: "2px 6px",
                            }}
                          >
                            {activeCount}/{group.keys.length}
                          </span>
                        </button>
                      </div>

                      {!isCollapsed &&
                        orderedKeys.map((key) => {
                          const item = digitasiLayers.find(
                            (layer) => layer.key === key,
                          );

                          if (!item) return null;

                          return (
                            <label
                              className="layer-row"
                              key={item.key}
                              style={{
                                marginLeft: 12,
                                width: "calc(100% - 12px)",
                                boxSizing: "border-box",
                                paddingLeft: 8,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={digitasiVisibility[item.key]}
                                onChange={(e) =>
                                  setDigitasiVisibility((old) => ({
                                    ...old,
                                    [item.key]: e.target.checked,
                                  }))
                                }
                              />

                              <span
                                className={
                                  item.key === "bm"
                                    ? "geometry-symbol geometry-point"
                                    : [
                                          "jalan",
                                          "pagar",
                                          "pipa-esdm",
                                          "pipa-spp",
                                          "rel-ka",
                                          "selokan",
                                          "sungai",
                                          "kontur-mayor",
                                          "kontur-minor",
                                        ].includes(item.key)
                                      ? "geometry-symbol geometry-line"
                                      : "geometry-symbol geometry-polygon"
                                }
                                style={
                                  {
                                    "--legend": item.color,

                                    ...([
                                      "kontur-mayor",
                                      "kontur-minor",
                                    ].includes(item.key)
                                      ? {
                                          display: "inline-block",
                                          width: "30px",
                                          minWidth: "30px",
                                          height:
                                            item.key === "kontur-mayor"
                                              ? "3px"
                                              : "2px",

                                          backgroundColor: item.color,
                                          borderRadius: "2px",
                                          flexShrink: 0,
                                        }
                                      : {}),

                                    ...(item.key === "rel-ka"
                                      ? {
                                          // Paksa legenda menjadi strip hitam-putih yang terlihat,

                                          // tidak mengikuti tinggi tipis dari class geometry-line.

                                          display: "inline-block",

                                          width: "30px",

                                          minWidth: "30px",

                                          height: "8px",

                                          minHeight: "8px",

                                          boxSizing: "border-box",

                                          backgroundColor: "#ffffff",

                                          backgroundImage:
                                            "repeating-linear-gradient(90deg, #242424 0 5px, #ffffff 5px 10px)",

                                          border: "1px solid #242424",

                                          borderRadius: "1px",

                                          flexShrink: 0,
                                        }
                                      : {}),
                                  } as React.CSSProperties
                                }
                                aria-label={
                                  item.key === "rel-ka"
                                    ? "Garis rel hitam putih"
                                    : item.key === "bm"
                                      ? "Titik"
                                      : [
                                            "jalan",
                                            "pagar",
                                            "pipa-esdm",
                                            "pipa-spp",
                                            "rel-ka",
                                            "selokan",
                                            "sungai",
                                            "kontur-mayor",
                                            "kontur-minor",
                                          ].includes(item.key)
                                        ? "Garis"
                                        : "Poligon"
                                }
                              />

                              <span className="layer-name">{item.label}</span>
                              <button
                                type="button"
                                title={`Zoom ke ${item.label}`}
                                aria-label={`Zoom ke ${item.label}`}
                                disabled={zoomingLayer === item.key}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void zoomToDigitasiLayer(item);
                                }}
                                style={{
                                  marginLeft: "auto",
                                  flex: "0 0 24px",
                                  width: 24,
                                  height: 24,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  border: "none",
                                  borderRadius: 4,
                                  background: "transparent",
                                  color: "#64748b",
                                  cursor: zoomingLayer === item.key ? "wait" : "pointer",
                                  fontSize: 15,
                                  lineHeight: 1,
                                  padding: 0,
                                }}
                              >
                                {zoomingLayer === item.key ? (
                                  "…"
                                ) : (
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="m20 20-4-4" />
                                  </svg>
                                )}
                              </button>
                            </label>
                          );
                        })}
                    </section>
                  );
                })}
                  </>
                ) : (
                  <div style={{ display: "grid", gap: 10, padding: "4px 2px 12px" }}>
                    <div style={{ padding: "2px 2px 0", fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", color: "#168aa4" }}>
                      TERRAIN 3D
                    </div>

                    <button
                      type="button"
                      onClick={() => activateTerrain("aws")}
                      aria-pressed={activeTerrain === "aws"}
                      style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                        textAlign: "left", borderRadius: 10,
                        border: activeTerrain === "aws" ? "2px solid #159bb2" : "1px solid #dce7eb",
                        background: activeTerrain === "aws" ? "#f2fafb" : "#fff", cursor: "pointer", color: "#284456",
                      }}
                    >
                      <span style={{ width: 36, height: 36, flex: "0 0 36px", borderRadius: 8, display: "grid", placeItems: "center", background: "#f0f4f5", color: "#334e5b" }} aria-hidden="true">
                        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 19 10 5l4 8 2-3 5 9H3Z" />
                        </svg>
                      </span>
                      <span style={{ display: "block", flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: 13 }}>AWS Terrarium</strong>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.alert("DTM Lokal belum tersedia.")}
                      aria-pressed={false}
                      style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                        textAlign: "left", borderRadius: 10,
                        border: "1px solid #dce7eb",
                        background: "#fff", cursor: "pointer", color: "#284456",
                      }}
                    >
                      <span style={{ width: 36, height: 36, flex: "0 0 36px", borderRadius: 8, display: "grid", placeItems: "center", background: "#f0f4f5", color: "#526b76" }} aria-hidden="true">
                        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m4 8 12-3 4 2-12 3-4-2Z" />
                          <path d="m4 13 12-3 4 2-12 3-4-2Z" />
                          <path d="m4 18 12-3 4 2-12 3-4-2Z" />
                        </svg>
                      </span>
                      <span style={{ display: "block", flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: 13 }}>DTM Lokal</strong>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#7c8991" }}>Belum tersedia</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => activateTerrain(null)}
                      disabled={!terrainOn}
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #dce7eb", borderRadius: 10,
                        background: terrainOn ? "#f6f9fa" : "#f8fafb", color: terrainOn ? "#385667" : "#a1adb5",
                        cursor: terrainOn ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700,
                      }}
                    >
                      Matikan Terrain 3D
                    </button>

                  </div>
                )}
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
                <span
                  className={`basemap-card-preview ${basemap === "google" ? "is-satellite" : basemap === "none" ? "is-none" : "is-street"}`}
                  aria-hidden="true"
                  style={{
                    backgroundColor: basemap === "none" ? "#e5e7eb" : undefined,
                    backgroundImage:
                      basemap === "none"
                        ? "none"
                        : basemap === "google"
                          ? 'url("https://mt1.google.com/vt/lyrs=s&x=26436&y=17018&z=15")'
                          : 'url("https://tile.openstreetmap.org/15/26436/17018.png")',
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />

                <span className="basemap-card-label">Basemap</span>
              </button>

              {showBasemapPanel && (
                <>
                  <div className="basemap-options-revised">
                    <button
                      type="button"
                      className={
                        basemap === "osm"
                          ? "basemap-option active"
                          : "basemap-option"
                      }
                      onClick={() => changeBasemap("osm")}
                    >
                      <span
                        className="basemap-preview basemap-preview-street"
                        style={{
                          backgroundImage:
                            'url("https://tile.openstreetmap.org/15/26436/17018.png")',
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }}
                      />

                      <span>OpenStreetMap</span>
                    </button>

                    <button
                      type="button"
                      className={
                        basemap === "google"
                          ? "basemap-option active"
                          : "basemap-option"
                      }
                      onClick={() => changeBasemap("google")}
                    >
                      <span
                        className="basemap-preview basemap-preview-satellite"
                        style={{
                          backgroundImage:
                            'url("https://mt1.google.com/vt/lyrs=s&x=26436&y=17018&z=15")',
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }}
                      />

                      <span>Satellite</span>
                    </button>

                    <button
                      type="button"
                      className={
                        orthophotoOn
                          ? "basemap-option active"
                          : "basemap-option"
                      }
                      onClick={toggleOrthophoto}
                    >
                      <span
                        className="basemap-preview basemap-preview-orthophoto"
                        style={{
                          // Preview Orthophoto memakai lokasi berbeda dari Satellite dan dibuat sedikit lebih terang.
                          backgroundImage:
                            'url("https://mt1.google.com/vt/lyrs=s&x=26434&y=17020&z=15")',
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          filter:
                            "brightness(1.22) contrast(1.04) saturate(0.9)",
                        }}
                      />
                      <span>Orthophoto</span>
                    </button>

                    <button
                      type="button"
                      className={
                        basemap === "none"
                          ? "basemap-option basemap-disable-option active"
                          : "basemap-option basemap-disable-option"
                      }
                      onClick={() => changeBasemap("none")}
                      aria-label="Nonaktifkan basemap"
                    >
                      <span className="basemap-disable-icon" aria-hidden="true">
                        ⊘
                      </span>
                      <span>Nonaktifkan basemap</span>
                    </button>
                  </div>

                  <style jsx>{`
                    .basemap-control {
                      position: relative !important;
                    }
                    .basemap-options-revised {
                      position: absolute !important;
                      right: calc(100% + 8px) !important;
                      top: 0 !important;
                      z-index: 1000 !important;
                      display: grid !important;
                      grid-template-columns: repeat(
                        3,
                        minmax(0, 72px)
                      ) !important;
                      grid-template-rows: auto auto !important;
                      align-items: stretch !important;
                      justify-content: center !important;
                      gap: 6px !important;
                      padding: 7px !important;
                      max-height: none !important;
                      overflow: visible !important;
                      width: max-content;
                      max-width: calc(100vw - 24px);
                      background: #fff;
                      border: 1px solid #d9e5e9;
                      border-radius: 12px;
                      box-shadow: 0 5px 18px rgba(24, 57, 70, 0.15);
                    }
                    .basemap-options-revised :global(.basemap-option) {
                      grid-column: auto !important;
                      display: flex !important;
                      flex-direction: column !important;
                      align-items: center !important;
                      justify-content: flex-start !important;
                      width: 72px !important;
                      min-width: 0 !important;
                      max-width: 72px !important;
                      padding: 4px !important;
                      gap: 4px !important;
                      text-align: center !important;
                      white-space: normal !important;
                      line-height: 1.15 !important;
                      font-size: 10px !important;
                    }
                    .basemap-options-revised :global(.basemap-preview) {
                      display: block !important;
                      width: 62px !important;
                      height: 43px !important;
                      flex: 0 0 43px !important;
                      margin: 0 !important;
                      background-size: cover !important;
                      background-position: center !important;
                      border-radius: 7px !important;
                    }
                    .basemap-options-revised :global(.basemap-disable-option) {
                      grid-column: 1 / -1 !important;
                      flex-direction: row !important;
                      justify-content: center !important;
                      width: 100% !important;
                      max-width: none !important;
                      min-height: 30px !important;
                      padding: 7px 10px !important;
                      gap: 7px !important;
                      border: 1px solid #dbe5e9 !important;
                      background: #f8fbfc !important;
                      font-size: 11px !important;
                    }
                    .basemap-options-revised
                      :global(.basemap-disable-option.active) {
                      border-color: #31b6d1 !important;
                      background: #effbfd !important;
                    }
                    .basemap-options-revised :global(.basemap-disable-icon) {
                      font-size: 15px;
                      line-height: 1;
                    }
                    @media (max-width: 760px) {
                      .basemap-options-revised {
                        top: calc(100% + 6px) !important;
                        right: 0 !important;
                        left: auto !important;
                        grid-template-columns: repeat(
                          3,
                          minmax(0, 60px)
                        ) !important;
                        grid-template-rows: auto auto !important;
                        gap: 4px !important;
                        padding: 5px !important;
                      }
                      .basemap-options-revised :global(.basemap-option) {
                        width: 60px !important;
                        max-width: 60px !important;
                        font-size: 9px !important;
                      }
                      .basemap-options-revised :global(.basemap-preview) {
                        width: 52px !important;
                        height: 36px !important;
                        flex-basis: 36px !important;
                      }
                      .basemap-options-revised
                        :global(.basemap-disable-option) {
                        width: 100% !important;
                        max-width: none !important;
                      }
                    }
                  `}</style>
                </>
              )}
            </div>
          </div>

          <div className={`stats-dock ${showStatsPanel ? "is-open" : "is-collapsed"}`}>
            <button
              type="button"
              className="stats-toggle-handle"
              onClick={() => setShowStatsPanel((open) => !open)}
              aria-expanded={showStatsPanel}
              aria-label={showStatsPanel ? "Sembunyikan informasi data" : "Tampilkan informasi data"}
              title={showStatsPanel ? "Sembunyikan informasi data" : "Tampilkan informasi data"}
            >
              <span
                aria-hidden="true"
                style={showStatsPanel ? {
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1,
                  fontFamily: "Arial, sans-serif",
                  pointerEvents: "none",
                } : undefined}
              >
                {showStatsPanel ? "×" : ""}
              </span>
            </button>

            {showStatsPanel && (
              <div className="stats-strip">
                <div>
                  <span>Jumlah Data</span>
                  <strong>{digitasiLayers.length}</strong>
                </div>

                <div>
                  <span>Layer aktif</span>
                  <strong>
                    {
                      digitasiLayers.filter((item) => digitasiVisibility[item.key])
                        .length
                    }
                  </strong>
                </div>

                {/* <div><span>Sumber data</span><strong>Cloudflare R2</strong></div> */}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
