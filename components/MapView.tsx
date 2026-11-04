"use client";

import { useEffect, useRef, useState } from "react";
import ElevationProfileWindow from "./ElevationProfileWindow";

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
  | "opsi-jalur-pipa-1"
  | "opsi-jalur-pipa-2"
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


// Cache GeoJSON utuh per file. Data yang sudah dimuat untuk layer utama
// akan dipakai kembali; layer lain baru diambil sekali saat pertama diklik.
const fullGeoJSONCache = new Map<string, Promise<any>>();

function getFullGeoJSON(file: string): Promise<any> {
  const cached = fullGeoJSONCache.get(file);
  if (cached) return cached;

  const request = (async () => {
    const response = await fetch(`${R2_DATA_BASE}/${encodeURIComponent(file)}`);
    if (!response.ok) throw new Error(`Gagal mengambil ${file}: HTTP ${response.status}`);
    return response.json();
  })();

  fullGeoJSONCache.set(file, request);
  request.catch(() => {
    if (fullGeoJSONCache.get(file) === request) fullGeoJSONCache.delete(file);
  });
  return request;
}

// Mengukur kedekatan titik klik terhadap geometri. Polygon yang memuat titik
// klik mendapat skor terbaik; untuk garis/titik dipilih geometri terdekat.
function getGeometryClickScore(geometry: any, lng: number, lat: number): number {
  if (!geometry) return Number.POSITIVE_INFINITY;

  const pointInRing = (ring: any[]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i]?.[0], yi = ring[i]?.[1];
      const xj = ring[j]?.[0], yj = ring[j]?.[1];
      if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
      const intersects = ((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-15) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const pointSegmentDistance = (a: any[], b: any[]): number => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((lng - a[0]) * dx + (lat - a[1]) * dy) / length2)) : 0;
    return Math.hypot(lng - (a[0] + t * dx), lat - (a[1] + t * dy));
  };

  let minDistance = Number.POSITIVE_INFINITY;
  const visitLine = (line: any[]) => {
    if (!Array.isArray(line)) return;
    if (line.length === 1 && Array.isArray(line[0])) {
      minDistance = Math.min(minDistance, Math.hypot(lng - line[0][0], lat - line[0][1]));
      return;
    }
    for (let i = 1; i < line.length; i++) {
      if (Array.isArray(line[i - 1]) && Array.isArray(line[i])) {
        minDistance = Math.min(minDistance, pointSegmentDistance(line[i - 1], line[i]));
      }
    }
  };

  const visitPolygon = (rings: any[]) => {
    if (!Array.isArray(rings) || !rings.length) return;
    const inOuter = pointInRing(rings[0] ?? []);
    const inHole = rings.slice(1).some((ring) => pointInRing(ring));
    if (inOuter && !inHole) {
      // Nilai negatif memilih poligon yang paling dalam memuat titik klik.
      let boundaryDistance = Number.POSITIVE_INFINITY;
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          boundaryDistance = Math.min(boundaryDistance, pointSegmentDistance(ring[i - 1], ring[i]));
        }
      }
      minDistance = Math.min(minDistance, -boundaryDistance);
    } else {
      for (const ring of rings) visitLine(ring);
    }
  };

  switch (geometry.type) {
    case "Point":
      minDistance = Math.hypot(lng - geometry.coordinates[0], lat - geometry.coordinates[1]);
      break;
    case "MultiPoint":
      for (const point of geometry.coordinates) minDistance = Math.min(minDistance, Math.hypot(lng - point[0], lat - point[1]));
      break;
    case "LineString":
      visitLine(geometry.coordinates);
      break;
    case "MultiLineString":
      for (const line of geometry.coordinates) visitLine(line);
      break;
    case "Polygon":
      visitPolygon(geometry.coordinates);
      break;
    case "MultiPolygon":
      for (const polygon of geometry.coordinates) visitPolygon(polygon);
      break;
    default:
      break;
  }
  return minDistance;
}

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

  {
    key: "opsi-jalur-pipa-1",
    label: "Opsi Jalur Pipa 1",
    file: "Opsi Jalur Pipa 1.geojson",
    color: "#00a6a6",
  },

  {
    key: "opsi-jalur-pipa-2",
    label: "Opsi Jalur Pipa 2",
    file: "Opsi Jalur Pipa 2.geojson",
    color: "#e0a12f",
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

  {
    title: "Opsi Jalur Pipa",
    keys: ["opsi-jalur-pipa-1", "opsi-jalur-pipa-2"],
  },

  { title: "Tutupan Lahan", keys: ["lahan-terbuka"] },

  { title: "Struktur", keys: ["pagar", "sempadan-sungai"] },

  { title: "Titik Kontrol Pemetaan", keys: ["bm"] },
];

const initialDigitasiLayers = Object.fromEntries(
  digitasiLayers.map((layer) => [
    layer.key,
    ![
      "kontur-mayor",
      "kontur-minor",
      "bm",
    ].includes(layer.key),
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
  const streetViewPickRef = useRef(false);
  const [streetViewPicking, setStreetViewPicking] = useState(false);
  const [measureMode, setMeasureMode] = useState<"length" | "width" | "height" | "area" | "profile" | null>(null);
  const [measureResult, setMeasureResult] = useState("");
  const [profileSamples, setProfileSamples] = useState<{ distance: number; elevation: number | null }[]>([]);
  const [showProfileWindow, setShowProfileWindow] = useState(false);
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [selectedMeasureTool, setSelectedMeasureTool] = useState<"length" | "area" | "height" | "profile" | null>(null);
  const measureModeRef = useRef<"length" | "width" | "height" | "area" | "profile" | null>(null);
  const measurePointsRef = useRef<[number, number, number | null][]>([]);
  const measureMarkersRef = useRef<Marker[]>([]);
  const featurePopupRef = useRef<maplibregl.Popup | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [digitasiVisibility, setDigitasiVisibility] = useState<
    Record<DigitasiKey, boolean>
  >(initialDigitasiLayers);
  // Label fitur dikontrol terpisah dari visibilitas layernya.
  // Label selalu OFF saat halaman pertama kali dibuka, terpisah dari status layer data.
  const [showFeatureLabels, setShowFeatureLabels] = useState({
    "kontur-mayor": false,
    "kontur-minor": false,
    bangunan: false,
    tangki: false,
  });

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
  const [showDtmRequiredNotice, setShowDtmRequiredNotice] = useState(false);

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

    map.on("load", () => {
      if (!map.getSource("measure-line")) {
        map.addSource("measure-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
      }
      if (!map.getSource("measure-label-point")) {
        map.addSource("measure-label-point", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getSource("measure-area")) {
        map.addSource("measure-area", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("measure-area-fill")) {
        map.addLayer({
          id: "measure-area-fill",
          type: "fill",
          source: "measure-area",
          paint: { "fill-color": "#18a999", "fill-opacity":  0.22 },
        });
      }
      if (!map.getLayer("measure-area-outline")) {
        map.addLayer({
          id: "measure-area-outline",
          type: "line",
          source: "measure-area",
          paint: { "line-color": "#087f8c", "line-width": 3 },
        });
      }
      if (!map.getLayer("measure-line-layer")) {
        map.addLayer({
          id: "measure-line-layer",
          type: "line",
          source: "measure-line",
          paint: {
            "line-color": "#087f8c",
            "line-width": 3,
            "line-opacity": 1,
          },
        });
      }
      if (!map.getLayer("measure-line-label")) {
        map.addLayer({
          id: "measure-line-label",
          type: "symbol",
          source: "measure-label-point",
          layout: {
            "symbol-placement": "point",
            "text-field": ["get", "label"],
            "text-size": 13,
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-anchor": "center",
            "text-justify": "center",
            "text-offset": ["get", "offset"],
            "text-line-height": 1.2,
            "text-max-width": 24,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#164e49",
            "text-halo-color": "rgba(255,255,255,0.98)",
            "text-halo-width": 2.5,
          },
        });
      }
    });

    map.on("dblclick", (event) => {
      const activeMeasure = measureModeRef.current;
      if (activeMeasure === "area" || activeMeasure === "profile") {
        // Pengukuran luas dan profil tidak membutuhkan double-click.
        // Cegah double-click agar tidak memicu zoom bawaan peta.
        event.preventDefault();
      }
    });

    map.on("click", (event) => {
      const activeMeasure = measureModeRef.current;
      if (activeMeasure) {
        const { lng, lat } = event.lngLat;
        const sampled = map.queryTerrainElevation([lng, lat]);
        const elevation =
          typeof sampled === "number" && Number.isFinite(sampled) ? sampled : null;
        const next = [...measurePointsRef.current, [lng, lat, elevation] as [number, number, number | null]];
        measurePointsRef.current = next;

        const toRad = (value: number) => (value * Math.PI) / 180;
        const segmentDistance = (
          a: [number, number, number | null],
          b: [number, number, number | null],
        ) => {
          const dLat = toRad(b[1] - a[1]);
          const dLng = toRad(b[0] - a[0]);
          const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
          return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
        };
        const formatDistance = (meters: number) =>
          meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(2)} m`;
        const first = next[0];
        const last = next[next.length - 1];
        const totalMeters = next.slice(1).reduce(
          (sum, point, index) => sum + segmentDistance(next[index], point), 0,
        );
        const heightLabel =
          first[2] == null || last[2] == null
            ? "Elevasi tidak tersedia. Aktifkan Terrain 3D."
            : `Beda tinggi: ${Math.abs(last[2] - first[2]).toFixed(2)} m`;

        // Hitung luas setiap kali titik batas baru ditambahkan agar label
        // di peta langsung menampilkan nilai luas, bukan jumlah titik.
        const areaSquareMeters = next.length >= 3
          ? (() => {
              const coords = next.map(([x, y]) => [toRad(x), toRad(y)] as [number, number]);
              let sum = 0;
              for (let i = 0; i < coords.length; i++) {
                const j = (i + 1) % coords.length;
                sum += (coords[j][0] - coords[i][0]) *
                  (2 + Math.sin(coords[i][1]) + Math.sin(coords[j][1]));
              }
              return Math.abs(sum * 6371008.8 * 6371008.8 / 2);
            })()
          : 0;
        const areaValueText = areaSquareMeters >= 10000
          ? `${(areaSquareMeters / 10000).toFixed(2)} ha`
          : `${areaSquareMeters.toFixed(2)} m²`;

        const lineLabel =
          next.length >= 2
            ? activeMeasure === "height"
              ? heightLabel
              : activeMeasure === "profile"
                ? `Profil elevasi · ${formatDistance(totalMeters)}`
                : activeMeasure === "area"
                  ? next.length >= 3 ? areaValueText : `Titik ${next.length}/3`
                  : `Panjang: ${formatDistance(totalMeters)}`
            : activeMeasure === "height"
              ? "Klik titik pertama, lalu titik kedua"
              : activeMeasure === "area"
                ? "Tambahkan titik batas area"
                : activeMeasure === "profile"
                  ? "Klik titik kedua untuk membuka grafik profil secara otomatis"
                  : "Klik peta untuk menambahkan titik";

        // Area: gambar poligon sementara saat titik batas ditambahkan.
        if (activeMeasure === "area") {
          const ring = next.map(([x, y]) => [x, y]);
          if (ring.length >= 3) ring.push(ring[0]);
          (map.getSource("measure-area") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: ring.length >= 4 ? [{
              type: "Feature",
              properties: {},
              geometry: { type: "Polygon", coordinates: [ring] },
            }] : [],
          });
          (map.getSource("measure-line") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "Feature",
            properties: { label: lineLabel },
            geometry: { type: "LineString", coordinates: next.map(([x, y]) => [x, y]) },
          });
          (map.getSource("measure-label-point") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: next.length >= 2 ? [{
              type: "Feature",
              properties: { label: lineLabel },
              geometry: { type: "Point", coordinates: [lng, lat] },
            }] : [],
          });
          setMeasureResult(next.length < 3
            ? `Tambahkan minimal 3 titik batas area (${next.length}/3).`
            : `Luas: ${areaValueText}`);
          return;
        }

        (map.getSource("measure-line") as maplibregl.GeoJSONSource | undefined)?.setData({
          type: "Feature",
          properties: { label: lineLabel },
          geometry: {
            type: "LineString",
            coordinates: next.map(([x, y]) => [x, y]),
          },
        });

        let labelCoordinate: [number, number] = [first[0], first[1]];
        if (next.length >= 2 && totalMeters > 0) {
          const target = totalMeters / 2;
          let accumulated = 0;
          for (let i = 1; i < next.length; i++) {
            const segment = segmentDistance(next[i - 1], next[i]);
            if (accumulated + segment >= target) {
              const fraction = segment > 0 ? (target - accumulated) / segment : 0;
              labelCoordinate = [
                next[i - 1][0] + (next[i][0] - next[i - 1][0]) * fraction,
                next[i - 1][1] + (next[i][1] - next[i - 1][1]) * fraction,
              ];
              break;
            }
            accumulated += segment;
          }
        }
        const measurementLabelFeatures =
          activeMeasure === "height" && next.length >= 2
            ? [
                {
                  type: "Feature" as const,
                  properties: {
                    label: `Awal: ${first[2] == null ? "N/A" : `${first[2].toFixed(2)} m`}`,
                    offset: [0, -1.5],
                  },
                  geometry: {
                    type: "Point" as const,
                    coordinates: [first[0], first[1]],
                  },
                },
                {
                  type: "Feature" as const,
                  properties: {
                    label: `Akhir: ${last[2] == null ? "N/A" : `${last[2].toFixed(2)} m`}`,
                    offset: [0, 1.5],
                  },
                  geometry: {
                    type: "Point" as const,
                    coordinates: [last[0], last[1]],
                  },
                },
                {
                  type: "Feature" as const,
                  properties: { label: lineLabel, offset: [0, 0] },
                  geometry: { type: "Point" as const, coordinates: labelCoordinate },
                },
              ]
            : next.length >= 2
              ? [{
                  type: "Feature" as const,
                  properties: { label: lineLabel, offset: [0, 0] },
                  geometry: { type: "Point" as const, coordinates: labelCoordinate },
                }]
              : [];

        (map.getSource("measure-label-point") as maplibregl.GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: measurementLabelFeatures,
        });

        if (next.length < 2) {
          setMeasureResult(
            activeMeasure === "height"
              ? "Klik titik kedua untuk menghitung beda tinggi."
              : activeMeasure === "profile"
                ? "Klik titik kedua untuk membuka grafik profil elevasi secara otomatis. Tambahkan titik lain untuk memperbarui jalur."
                : "Klik titik berikutnya untuk melanjutkan pengukuran panjang.",
          );
        } else if (activeMeasure === "height") {
          setMeasureResult(heightLabel);
          measureModeRef.current = null;
          setMeasureMode(null);
        } else if (activeMeasure === "profile") {
          const elevations = next
            .map((point) => point[2])
            .filter((value): value is number => value != null && Number.isFinite(value));

          // Profil diperbarui dan dibuka otomatis setelah titik kedua.
          // Pengguna dapat terus menambahkan titik; grafik akan ikut diperbarui.
          if (next.length >= 2 && totalMeters > 0) {
            const targetSpacing = 3;
            const maxSamples = 1200;
            const intervalCount = Math.max(
              1,
              Math.min(maxSamples - 1, Math.ceil(totalMeters / targetSpacing)),
            );
            const segments = next.slice(1).map((point, index) => ({
              start: next[index],
              end: point,
              length: segmentDistance(next[index], point),
            }));
            const vertexDistances = [0];
            for (const segment of segments) {
              vertexDistances.push(vertexDistances[vertexDistances.length - 1] + segment.length);
            }

            const liveSamples: { distance: number; elevation: number | null }[] = [];
            for (let sampleIndex = 0; sampleIndex <= intervalCount; sampleIndex++) {
              const targetDistance = (totalMeters * sampleIndex) / intervalCount;
              let segmentIndex = segments.findIndex(
                (segment, index) =>
                  targetDistance <= vertexDistances[index + 1] ||
                  index === segments.length - 1,
              );
              if (segmentIndex < 0) segmentIndex = segments.length - 1;
              const segment = segments[segmentIndex];
              const segmentLength = segment.length;
              const fraction = segmentLength > 0
                ? Math.max(
                    0,
                    Math.min(
                      1,
                      (targetDistance - vertexDistances[segmentIndex]) / segmentLength,
                    ),
                  )
                : 0;
              const lng = segment.start[0] + (segment.end[0] - segment.start[0]) * fraction;
              const lat = segment.start[1] + (segment.end[1] - segment.start[1]) * fraction;
              const terrainElevation = map.queryTerrainElevation([lng, lat]);
              liveSamples.push({
                distance: targetDistance,
                elevation:
                  typeof terrainElevation === "number" && Number.isFinite(terrainElevation)
                    ? terrainElevation
                    : null,
              });
            }

            const validLiveSamples = liveSamples.filter(
              (sample) => sample.elevation !== null && Number.isFinite(sample.elevation),
            );
            const clickedSamples: { distance: number; elevation: number | null }[] = [];
            let clickedDistance = 0;
            next.forEach((point, index) => {
              if (index > 0) clickedDistance += segmentDistance(next[index - 1], point);
              clickedSamples.push({
                distance: clickedDistance,
                elevation:
                  typeof point[2] === "number" && Number.isFinite(point[2])
                    ? point[2]
                    : null,
              });
            });

            setProfileSamples(validLiveSamples.length >= 2 ? liveSamples : clickedSamples);
            setShowProfileWindow(true);
          }

          setMeasureResult(
            elevations.length
              ? `Profil elevasi · jarak ${formatDistance(totalMeters)} · ${elevations.length} titik jalur. Grafik diperbarui otomatis.`
              : "Elevasi profil belum terbaca. Pastikan DTM aktif dan tile elevasi tersedia.",
          );
        } else {
          setMeasureResult(`Panjang: ${formatDistance(totalMeters)}`);
        }
        return;
      }

      // Mode Street View: klik lokasi pada peta untuk membuka panorama Google.
      if (streetViewPickRef.current) {
        streetViewPickRef.current = false;
        setStreetViewPicking(false);
        const { lat, lng } = event.lngLat;
        const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
        window.open(streetViewUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // Jika highlight berasal dari tombol Zoom To, hapus saat pengguna
      // mengeklik area peta yang tidak memiliki fitur digitasi.
      // Klik pada fitur digitasi tidak menghapusnya di sini; handler fitur
      // akan mengganti highlight dengan fitur yang diklik dan menampilkan popup.
      const digitasiClickableLayerIds = (map.getStyle().layers ?? [])
        .map((layer) => layer.id)
        .filter(
          (layerId) =>
            layerId.startsWith("digitasi-") &&
            (layerId.endsWith("-fill") ||
              layerId.endsWith("-line") ||
              layerId.endsWith("-point")) &&
            Boolean(map.getLayer(layerId)),
        );

      const clickedDigitasiFeatures = digitasiClickableLayerIds.length
        ? map.queryRenderedFeatures(event.point, {
            layers: digitasiClickableLayerIds,
          })
        : [];

      if (clickedDigitasiFeatures.length === 0) {
        const highlightSource = map.getSource(
          "selected-feature-highlight-source",
        ) as maplibregl.GeoJSONSource | undefined;

        highlightSource?.setData({
          type: "FeatureCollection",
          features: [],
        } as GeoJSON.FeatureCollection);
      }

    });

    setZoomLevel(map.getZoom());

    map.on("zoom", () => setZoomLevel(map.getZoom()));

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

          /* Kontrol kanan hanya berisi tombol zoom + dan −. */
          .maplibregl-ctrl-bottom-right {
            right: 0 !important;
            bottom: 0 !important;
          }
          .maplibregl-ctrl-bottom-right .maplibregl-ctrl-group {
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            width: 44px !important;
            margin: 0 10px 10px 0 !important;
            padding: 0 !important;
            border: 1px solid #d7e0e5 !important;
            border-radius: 10px !important;
            background: #fff !important;
            box-shadow: 0 2px 8px rgba(22,55,68,.16) !important;
          }
          .maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button {
            box-sizing: border-box !important;
            display: block !important;
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            min-height: 44px !important;
            max-width: 44px !important;
            max-height: 44px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background-color: #fff !important;
          }
          .maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button + button {
            border-top: 1px solid #e7eef1 !important;
          }
          .maplibregl-ctrl-bottom-right .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
            width: 20px !important;
            height: 20px !important;
            background-size: 20px 20px !important;
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

      // Sumber sementara untuk menyorot fitur yang sedang dipilih.
      // Datanya diisi saat pengguna mengeklik fitur pada peta.
      map.addSource("selected-feature-highlight-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Cache GeoJSON yang sudah diunduh agar klik berikutnya tidak
      // mengunduh dan mem-parse file yang sama berulang kali.
      const digitasiGeoJSONCache = new Map<string, any>();
      // Satu klik dapat mengenai beberapa layer yang saling bertumpuk.
      // Proses popup cukup dijalankan sekali untuk event klik yang sama.
      const handledDigitasiClickEvents = new WeakSet<object>();

      for (const item of digitasiLayers) {
        const sourceId = `digitasi-${item.key}-source`;

        const fillId = `digitasi-${item.key}-fill`;

        const lineId = `digitasi-${item.key}-line`;

        const pointId = `digitasi-${item.key}-point`;

        const dataUrl = `${R2_DATA_BASE}/${encodeURIComponent(item.file)}`;

        let sourceData: any = dataUrl;

        if (
          [
            "bangunan",
            "kontur-mayor",
            "kontur-minor",
            "opsi-jalur-pipa-1",
            "opsi-jalur-pipa-2",
          ].includes(item.key)
        ) {
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
            digitasiGeoJSONCache.set(item.key, geojson);

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

          // Opsi jalur pipa ditampilkan sebagai garis, bukan area terisi.
          // Jika data sumber berupa Polygon, fill dinonaktifkan dan batasnya
          // digambar oleh layer line di bawah.
          filter: item.key.startsWith("opsi-jalur-pipa-")
            ? ["==", ["geometry-type"], "Point"]
            : ["==", ["geometry-type"], "Polygon"],

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

          filter: item.key.startsWith("opsi-jalur-pipa-")
            ? [
                "any",
                ["==", ["geometry-type"], "LineString"],
                ["==", ["geometry-type"], "Polygon"],
              ]
            : ["==", ["geometry-type"], "LineString"],

          paint: {
            "line-color": item.key === "rel-ka" ? "#242424" : item.color,

            "line-width": item.key.startsWith("opsi-jalur-pipa-")
              ? 4
              : item.key === "kontur-mayor"
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

        // Label elevasi untuk Kontur Mayor/Minor. Label membaca langsung
        // properti ELEVATION dari GeoJSON dan tidak mengubah tampilan garis.
        if (item.key === "kontur-mayor" || item.key === "kontur-minor") {
          map.addLayer({
            id: `${lineId}-elevation-label`,
            type: "symbol",
            source: sourceId,
            filter: [
              "all",
              ["==", ["geometry-type"], "LineString"],
              ["has", "ELEVATION"],
              ["!=", ["to-string", ["get", "ELEVATION"]], ""],
            ],
            layout: {
              visibility: "none",
              "symbol-placement": "line",
              "symbol-spacing": item.key === "kontur-mayor" ? 320 : 420,
              "text-field": ["to-string", ["get", "ELEVATION"]],
              "text-font": ["Open Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 16, 11, 19, 12],
              "text-keep-upright": true,
              "text-rotation-alignment": "map",
              "text-pitch-alignment": "viewport",
              "text-padding": 3,
              "text-allow-overlap": false,
              "text-ignore-placement": false,
            },
            paint: {
              "text-color": item.key === "kontur-mayor" ? "#70402e" : "#806544",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
              "text-halo-blur": 0.3,
              "text-opacity": 0.95,
            },
          });
          // Paksa label kontur tetap tersembunyi saat peta pertama kali dibuka.
          // Label hanya akan tampil setelah tombol 123 untuk layer ini diaktifkan.
          map.setLayoutProperty(`${lineId}-elevation-label`, "visibility", "none");
        }

        // Label keterangan untuk Bangunan dan Tangki. Mendukung variasi kapitalisasi
        // nama properti GeoJSON: keterangan, KETERANGAN, atau Keterangan.
        if (item.key === "bangunan" || item.key === "tangki") {
          const keteranganExpression = [
            "to-string",
            ["coalesce", ["get", "keterangan"], ["get", "KETERANGAN"], ["get", "Keterangan"], ""],
          ] as any;

          map.addLayer({
            id: `${lineId}-keterangan-label`,
            type: "symbol",
            source: sourceId,
            filter: ["!=", keteranganExpression, ""],
            layout: {
              visibility: "none",
              "symbol-placement": "point",
              "text-field": keteranganExpression,
              "text-font": ["Open Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 16, 11, 19, 12],
              "text-allow-overlap": false,
              "text-ignore-placement": false,
              "text-padding": 2,
              "text-max-width": 12,
            },
            paint: {
              "text-color": item.key === "bangunan" ? "#63351f" : "#713c3a",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
              "text-halo-blur": 0.25,
              "text-opacity": 0.98,
            },
          });
          // Paksa label bangunan/tangki tersembunyi saat awal, meskipun layer datanya aktif.
          // Label hanya tampil jika tombol abc diaktifkan oleh pengguna.
          map.setLayoutProperty(`${lineId}-keterangan-label`, "visibility", "none");
        }

        map.addLayer({
          id: pointId,

          type: "circle",

          source: sourceId,

          filter: ["==", "$type", "Point"],

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

        map.on("click", popupLayerIds, async (event) => {
          // Handler dipasang pada tiap layer, tetapi klik pada fitur bertumpuk
          // dapat memicu lebih dari satu handler. Abaikan pemanggilan duplikat.
          if (handledDigitasiClickEvents.has(event as object)) return;
          handledDigitasiClickEvents.add(event as object);

          // Saat Measure aktif, klik layer hanya menjadi input titik ukur.
          // Jangan munculkan popup atribut yang menutupi peta.
          if (measureModeRef.current !== null) {
            event.preventDefault();
            return;
          }

          // Ambil semua fitur yang benar-benar berada di titik klik dari seluruh
          // layer digitasi. Jangan hanya memakai event.features[0], karena event
          // layer yang bertumpuk bisa lebih dulu memilih poligon di bawah bangunan.
          const clickableLayerIds = digitasiLayers
            .flatMap((layerItem) => [
              `digitasi-${layerItem.key}-fill`,
              `digitasi-${layerItem.key}-line`,
              `digitasi-${layerItem.key}-point`,
            ])
            .filter((layerId) => Boolean(map.getLayer(layerId)));

          const renderedFeatures = clickableLayerIds.length
            ? map.queryRenderedFeatures(event.point, {
                layers: clickableLayerIds,
              })
            : (event.features ?? []);

          // Prioritaskan Bangunan jika ada tepat di lokasi klik. Jika tidak,
          // gunakan fitur paling atas yang ditemukan oleh MapLibre.
          const feature =
            renderedFeatures.find((candidate) =>
              candidate.layer?.id.startsWith("digitasi-bangunan-"),
            ) ?? renderedFeatures[0];

          if (!feature) return;

          // Tutup seleksi sebelumnya lebih awal. Event close akan membersihkan
          // highlight lama sebelum geometri fitur baru dipasang.
          featurePopupRef.current?.remove();
          featurePopupRef.current = null;

          // Tentukan nama layer dari fitur terpilih, bukan dari handler layer
          // yang kebetulan menerima event lebih dahulu.
          const selectedLayerItem = digitasiLayers.find((layerItem) =>
            feature.layer?.id.startsWith(`digitasi-${layerItem.key}-`),
          );
          const selectedLayerLabel = selectedLayerItem?.label ?? item.label;

          // Ambil kandidat dari GeoJSON utuh. Jangan memilih kandidat pertama
          // hanya karena atributnya sama: banyak fitur memiliki atribut/id serupa.
          // Cocokkan juga posisi geometri dengan koordinat klik agar fitur yang
          // benar dipilih dan highlight mengikuti geometri lengkapnya.
          let fullFeature: any = feature;
          if (selectedLayerItem?.file) {
            try {
              const geojson =
                digitasiGeoJSONCache.get(selectedLayerItem.key) ??
                await getFullGeoJSON(selectedLayerItem.file);

              const clickedProperties = feature.properties ?? {};
              const clickedKey = JSON.stringify(clickedProperties);
              let candidates = (geojson.features ?? []).filter(
                (candidate: any) =>
                  JSON.stringify(candidate.properties ?? {}) === clickedKey,
              );

              // Jika data memiliki ID fitur yang stabil, gunakan sebagai prioritas.
              if (feature.id !== undefined && feature.id !== null) {
                const byId = candidates.find(
                  (candidate: any) => String(candidate.id) === String(feature.id),
                );
                if (byId) candidates = [byId];
              }

              if (candidates.length === 1) {
                fullFeature = candidates[0];
              } else if (candidates.length > 1) {
                const { lng, lat } = event.lngLat;
                candidates.sort(
                  (a: any, b: any) =>
                    getGeometryClickScore(a.geometry, lng, lat) -
                    getGeometryClickScore(b.geometry, lng, lat),
                );
                fullFeature = candidates[0] ?? feature;
              }
            } catch (error) {
              console.warn(
                `Geometri utuh ${selectedLayerItem.file} tidak tersedia; memakai geometri hasil render.`,
                error,
              );
            }
          }

          // Sorot geometri fitur yang dipilih. Untuk layer biasa, gunakan geometri
          // lengkap dari GeoJSON asli, termasuk kontur yang dipilih berdasarkan jarak
          // geometri ke titik klik agar garis utuh dan tidak tertukar dengan kontur lain.
          const highlightSource = map.getSource(
            "selected-feature-highlight-source",
          ) as maplibregl.GeoJSONSource | undefined;

          if (highlightSource && fullFeature.geometry) {
            highlightSource.setData({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  id: fullFeature.id ?? feature.id,
                  properties: fullFeature.properties ?? feature.properties ?? {},
                  geometry: fullFeature.geometry,
                },
              ],
            } as GeoJSON.FeatureCollection);

            // Pastikan highlight berada di atas layer lain, termasuk layer
            // yang ditambahkan setelah proses inisialisasi utama.
            for (const highlightLayerId of [
              "selected-feature-highlight-fill",
              "selected-feature-highlight-polygon-glow",
              "selected-feature-highlight-polygon-outline",
              "selected-feature-highlight-line-glow",
              "selected-feature-highlight-line-casing",
              "selected-feature-highlight-line",
              "selected-feature-highlight-point",
            ]) {
              if (map.getLayer(highlightLayerId)) {
                map.moveLayer(highlightLayerId);
              }
            }
          }

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

          const popupHtml = `<div style="font-family:Arial,sans-serif;min-width:160px;max-width:240px;color:#1f2937;"><div style="font-size:12px;font-weight:700;padding:1px 1px 5px;margin-bottom:3px;color:#29485d;letter-spacing:-0.2px;">${escapePopupHtml(selectedLayerLabel)}</div><div style="max-height:180px;overflow:auto;font-size:10px;scrollbar-width:thin;">${rows}</div>${entries.length > 30 ? `<div style="font-size:10px;color:#718096;padding-top:5px;">Menampilkan 30 dari ${entries.length} atribut.</div>` : ""}</div>`;

          const popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: "260px",
            className: "soft-attribute-popup",
          });

          // Saat popup ditutup (tombol ×, klik peta, atau remove()), hapus
          // hanya sumber highlight seleksi. Layer/data asli tetap utuh.
          popup.on("close", () => {
            // Abaikan event dari popup lama jika sudah ada popup yang lebih baru.
            if (featurePopupRef.current !== popup) return;
            featurePopupRef.current = null;
            const source = map.getSource(
              "selected-feature-highlight-source",
            ) as maplibregl.GeoJSONSource | undefined;
            source?.setData({
              type: "FeatureCollection",
              features: [],
            } as GeoJSON.FeatureCollection);
          });

          featurePopupRef.current = popup;
          popup
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

      // Lapisan sorotan ditambahkan paling atas agar fitur terpilih terlihat jelas.
      // Highlight poligon ala QGIS Identify: isi merah transparan
      // dan outline merah tegas yang mengikuti bentuk fitur.
      map.addLayer({
        id: "selected-feature-highlight-fill",
        type: "fill",
        source: "selected-feature-highlight-source",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#ff3026",
          "fill-opacity": 0.48,
        },
      });

      // Halo merah lembut di luar batas poligon terpilih.
      // Layer blur diletakkan di bawah outline utama agar efeknya memudar,
      // bukan membuat batas terlihat tebal/kaku.
      map.addLayer({
        id: "selected-feature-highlight-polygon-glow",
        type: "line",
        source: "selected-feature-highlight-source",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": "#ff2018",
          "line-width": 13,
          "line-opacity": 0.62,
          "line-blur": 6,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });

      map.addLayer({
        id: "selected-feature-highlight-polygon-outline",
        type: "line",
        source: "selected-feature-highlight-source",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": "#a80012",
          "line-width": 1.8,
          "line-opacity": 1,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });

      // Halo merah yang memudar di luar garis terpilih. Dibuat terpisah dari
      // garis inti supaya kontur/jalur pipa tetap halus dan tidak tampak kaku.
      map.addLayer({
        id: "selected-feature-highlight-line-glow",
        type: "line",
        source: "selected-feature-highlight-source",
        paint: {
          "line-color": "#ff2018",
          "line-width": 14,
          "line-opacity": 0.68,
          "line-blur": 6,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });

      // Casing merah tua yang tipis menjaga keterbacaan di atas ortofoto
      // dan layer berwarna. Mendukung LineString serta MultiLineString.
      map.addLayer({
        id: "selected-feature-highlight-line-casing",
        type: "line",
        source: "selected-feature-highlight-source",
        paint: {
          "line-color": "#a80012",
          "line-width": 4.8,
          "line-opacity": 0.96,
          "line-blur": 0.15,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });

      // Garis merah utama di atas casing supaya highlight jelas tetapi tetap halus.
      map.addLayer({
        id: "selected-feature-highlight-line",
        type: "line",
        source: "selected-feature-highlight-source",
        paint: {
          "line-color": "#ff3026",
          "line-width": 3.2,
          "line-opacity": 1,
          "line-blur": 0.1,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });

      map.addLayer({
        id: "selected-feature-highlight-point",
        type: "circle",
        source: "selected-feature-highlight-source",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#d9485f",
          "circle-opacity": 0.45,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });

      // Terapkan visibilitas awal berdasarkan state React untuk SEMUA layer.
      // Jangan mematikan kontur secara paksa: jika tidak, garis bisa tetap tersembunyi
      // walaupun checkbox sudah aktif karena effect React dapat berjalan sebelum layer dibuat.
      for (const item of digitasiLayers) {
        const visible = digitasiVisibility[item.key] ? "visible" : "none";
        const prefix = `digitasi-${item.key}-`;
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.id.startsWith(prefix)) {
            map.setLayoutProperty(layer.id, "visibility", visible);
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

      // Bangunan digambar paling atas agar tidak tertutup oleh poligon
      // seperti Rawa. Layer lain tetap mengikuti urutan sebelumnya.
      const orderedDigitasiLayers = [
        ...digitasiLayers.filter((item) => item.key !== "bangunan"),
        ...digitasiLayers.filter((item) => item.key === "bangunan"),
      ];

      for (const kind of orderedKinds) {
        for (const item of orderedDigitasiLayers) {
          if (kind === "line-casing" && item.key !== "rel-ka") continue;
          const id = `digitasi-${item.key}-${kind}`;
          if (map.getLayer(id)) map.moveLayer(id);
        }
      }

      // Pastikan outline bangunan berada di atas fill bangunan dan layer tematik lain.
      const buildingOutlineId = "digitasi-bangunan-line-polygon-outline";
      if (map.getLayer(buildingOutlineId)) map.moveLayer(buildingOutlineId);

      // Label kontur harus dipindahkan PALING ATAS setelah semua layer tematik
      // diurutkan. Jika tidak, fill/garis yang ditambahkan belakangan dapat
      // menutupi teks label walaupun tombol 123 sudah aktif.
      const featureLabelLayerIds = [
        "digitasi-kontur-mayor-line-elevation-label",
        "digitasi-kontur-minor-line-elevation-label",
        "digitasi-bangunan-line-keterangan-label",
        "digitasi-tangki-line-keterangan-label",
      ];

      for (const id of featureLabelLayerIds) {
        if (map.getLayer(id)) {
          map.moveLayer(id);
          // Default aman: semua label dimatikan saat peta pertama kali dibuka.
          // Tombol abc/123 akan mengaktifkannya melalui showFeatureLabels.
          map.setLayoutProperty(id, "visibility", "none");
        }
      }

      // MapLibre dapat menyelesaikan pemuatan sumber setelah layer dibuat.
      // Terapkan kembali kondisi awal saat peta siap agar label Bangunan/Tangki
      // tidak sempat tampil hanya karena layer data aktif dari awal.
      map.once("idle", () => {
        for (const id of featureLabelLayerIds) {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", "none");
          }
        }
      });

      // Draw measurement graphics above thematic layers. Label kontur tetap
      // berada di atas fitur peta agar nilai elevasinya terbaca.
      for (const id of ["measure-line-layer", "measure-line-label", "measure-points-layer"]) {
        if (map.getLayer(id)) map.moveLayer(id);
      }
    });

    return () => {
      measureMarkersRef.current.forEach((marker) => marker.remove());
      measureMarkersRef.current = [];
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

    if (!map) return;

    digitasiLayers.forEach((item) => {
      const visibility = digitasiVisibility[item.key] ? "visible" : "none";

      // Sertakan outline poligon khusus Bangunan agar ikut mati saat layer dinonaktifkan.
      const layerKinds =
        item.key === "bangunan"
          ? ["fill", "line-casing", "line", "point", "line-polygon-outline"]
          : ["fill", "line-casing", "line", "point"];

      layerKinds.forEach((kind) => {
        const id = `digitasi-${item.key}-${kind}`;
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibility);
        }
      });

      if (item.key === "kontur-mayor" || item.key === "kontur-minor") {
        const labelId = `digitasi-${item.key}-line-elevation-label`;
        if (map.getLayer(labelId)) {
          map.setLayoutProperty(
            labelId,
            "visibility",
            digitasiVisibility[item.key] && showFeatureLabels[item.key] ? "visible" : "none",
          );
        }
      }

      if (item.key === "bangunan" || item.key === "tangki") {
        const labelId = `digitasi-${item.key}-line-keterangan-label`;
        if (map.getLayer(labelId)) {
          map.setLayoutProperty(
            labelId,
            "visibility",
            digitasiVisibility[item.key] && showFeatureLabels[item.key] ? "visible" : "none",
          );
        }
      }
    });
  }, [digitasiVisibility, showFeatureLabels]);

  // Semua raster (basemap dan orthophoto) diletakkan sebelum layer digitasi pertama.

  // Dengan begitu urutannya: OSM/Satelit -> Orthophoto -> seluruh layer digitasi.

  function getFirstDigitasiLayerId(map: MapLibreMap): string | undefined {
    // Cari layer vektor digitasi yang benar-benar ada di style saat ini.
    // Ini lebih aman daripada mengandalkan urutan konfigurasi saja.
    const styleLayers = map.getStyle().layers ?? [];
    const firstDigitasi = styleLayers.find((layer) =>
      layer.id.startsWith("digitasi-"),
    );
    if (firstDigitasi) return firstDigitasi.id;

    // Fallback untuk struktur layer lama.
    for (const item of digitasiLayers) {
      for (const kind of ["fill", "line-polygon-outline", "line-casing", "line", "point"]) {
        const id = `digitasi-${item.key}-${kind}`;
        if (map.getLayer(id)) return id;
      }
    }
    return undefined;
  }

  function keepRasterBelowDigitasi(map: MapLibreMap, rasterLayerId: string) {
    if (!map.getLayer(rasterLayerId)) return;

    const firstDigitasiLayerId = getFirstDigitasiLayerId(map);
    if (firstDigitasiLayerId && rasterLayerId !== firstDigitasiLayerId) {
      // Tempatkan raster tepat sebelum layer digitasi pertama agar semua
      // poligon, garis, titik, dan outline tetap dirender di atas ortofoto.
      map.moveLayer(rasterLayerId, firstDigitasiLayerId);
    }
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

    // Pertahankan urutan raster dasar di bawah overlay ortofoto dan digitasi.
    if (map.getLayer("orthophoto-base") && orthophotoOn) {
      keepRasterBelowDigitasi(map, "orthophoto-base");
    }
    if (map.getLayer(googleLayerId) && map.getLayer("orthophoto-base")) {
      map.moveLayer(googleLayerId, "orthophoto-base");
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

            paint: { "raster-opacity": 1 },
          },
          getFirstDigitasiLayerId(map),
        );
      } else {
        map.setLayoutProperty(layerId, "visibility", "visible");

        map.setPaintProperty(layerId, "raster-opacity", 1);
      }

      // Penting: ortofoto harus berada di bawah SEMUA layer vektor.
      // Opacity raster tidak bisa menggantikan urutan layer yang benar.
      map.setPaintProperty(layerId, "raster-opacity", 1);
      keepRasterBelowDigitasi(map, layerId);
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
    // DTM tiles from Cloudflare R2 (XYZ PNG). Set the base URL in .env.local.
    const dtmTilesBase =
      process.env.NEXT_PUBLIC_DTM_TERRAIN_TILES_BASE?.trim() ||
      "/api/dtm";
    const dtmEncoding =
      process.env.NEXT_PUBLIC_DTM_TERRAIN_ENCODING?.trim() || "terrarium";

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
            tiles: [`${dtmTilesBase}/{z}/{x}/{y}.png`],
            tileSize: 256,
            encoding: dtmEncoding === "mapbox" ? "mapbox" : "terrarium",
            minzoom: 14,
            maxzoom: 20,
            attribution: "DTM Lokal: Cloudflare R2",
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
        ((item.key === "kontur-mayor" ||
          item.key === "kontur-minor" ||
          item.key === "opsi-jalur-pipa-1" ||
          item.key === "opsi-jalur-pipa-2") &&
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

      // Zoom dari ikon kaca pembesar juga menampilkan highlight. Karena ikon ini
      // bekerja pada level LAYER (bukan satu fitur), highlight mencakup fitur-fitur
      // dalam layer tersebut. Klik langsung pada peta tetap menyorot satu fitur saja.
      // Tutup popup fitur sebelumnya supaya popup lama tidak tertinggal saat
      // pengguna berpindah ke aksi zoom layer. Highlight layer dipasang setelahnya.
      featurePopupRef.current?.remove();
      featurePopupRef.current = null;

      const selectedSource = map.getSource(
        "selected-feature-highlight-source",
      ) as maplibregl.GeoJSONSource | undefined;
      if (selectedSource) {
        const highlightFeatures = features
          .filter((feature: any) => feature?.geometry)
          .map((feature: any) => {
            const coordinates = feature.geometry.coordinates;
            const featureLooksProjected = coordinates
              ? (() => {
                  const stack = [coordinates];
                  while (stack.length) {
                    const value = stack.pop();
                    if (!Array.isArray(value)) continue;
                    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
                      if (Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) return true;
                    } else {
                      stack.push(...value);
                    }
                  }
                  return false;
                })()
              : false;
            const convertCoordinates = (value: any): any => {
              if (!Array.isArray(value)) return value;
              if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
                if (!shouldConvert || !featureLooksProjected) return value;
                const lon = (value[0] / 20037508.342789244) * 180;
                const lat = (Math.atan(Math.sinh(value[1] / 6378137)) * 180) / Math.PI;
                return [lon, lat, ...value.slice(2)];
              }
              return value.map(convertCoordinates);
            };
            return {
              type: "Feature",
              id: feature.id,
              properties: feature.properties ?? {},
              geometry: {
                ...feature.geometry,
                ...(coordinates ? { coordinates: convertCoordinates(coordinates) } : {}),
              },
            };
          });
        selectedSource.setData({
          type: "FeatureCollection",
          features: highlightFeatures,
        } as GeoJSON.FeatureCollection);
        for (const highlightLayerId of [
          "selected-feature-highlight-fill",
          "selected-feature-highlight-polygon-glow",
          "selected-feature-highlight-polygon-outline",
          "selected-feature-highlight-line-glow",
          "selected-feature-highlight-line-casing",
          "selected-feature-highlight-line",
          "selected-feature-highlight-point",
        ]) {
          if (map.getLayer(highlightLayerId)) map.moveLayer(highlightLayerId);
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
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`Belum bisa zoom ke ${item.label}. Detail: ${detail}`);
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
        <section className={`map-area map-area-full ${showProfileWindow && selectedMeasureTool === "profile" ? "profile-open" : ""}`}>
          {showDtmRequiredNotice && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="dtm-required-title"
              aria-describedby="dtm-required-description"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2147483000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                background: "rgba(20, 38, 48, 0.24)",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: "min(360px, calc(100vw - 40px))",
                  padding: "22px 22px 18px",
                  borderRadius: 18,
                  background: "#fff7f7",
                  border: "1px solid #f1c8ca",
                  boxShadow: "0 16px 48px rgba(25, 48, 60, 0.24)",
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    margin: "0 auto 12px",
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "#fde5e6",
                    color: "#bd454c",
                  }}
                >
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                </div>
                <div id="dtm-required-title" style={{ color: "#8f343b", fontSize: 16, fontWeight: 750 }}>
                  DTM belum diaktifkan
                </div>
                <div id="dtm-required-description" style={{ marginTop: 8, color: "#754b4e", fontSize: 13, lineHeight: 1.55 }}>
                  Aktifkan DTM Lokal terlebih dahulu untuk menggunakan Profil Elevasi.
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 9, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowDtmRequiredNotice(false)}
                    style={{
                      minHeight: 38,
                      padding: "8px 14px",
                      border: "1px solid #e5c6c8",
                      borderRadius: 9,
                      background: "#ffffff",
                      color: "#754b4e",
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: "pointer",
                    }}
                  >
                    Nanti
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDtmRequiredNotice(false);
                      setShowLayerPanel(true);
                      setActiveLayerTab("terrain");
                    }}
                    style={{
                      minHeight: 38,
                      padding: "8px 14px",
                      border: "1px solid #bd454c",
                      borderRadius: 9,
                      background: "#bd454c",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Aktifkan DTM
                  </button>
                </div>
              </div>
            </div>
          )}
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
                    "opsi-jalur-pipa-1",
                    "opsi-jalur-pipa-2",
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
                              fontSize: 14,
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
                                          "opsi-jalur-pipa-1",
                                          "opsi-jalur-pipa-2",
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
                              {(["kontur-mayor", "kontur-minor", "bangunan", "tangki"] as DigitasiKey[]).includes(item.key) && (
                                <button
                                  type="button"
                                  title={`${showFeatureLabels[item.key as keyof typeof showFeatureLabels] ? "Sembunyikan" : "Tampilkan"} label ${item.key === "bangunan" || item.key === "tangki" ? "keterangan" : "elevasi"} ${item.label}`}
                                  aria-label={`${showFeatureLabels[item.key as keyof typeof showFeatureLabels] ? "Sembunyikan" : "Tampilkan"} label ${item.label}`}
                                  aria-pressed={showFeatureLabels[item.key as keyof typeof showFeatureLabels]}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const labelKey = item.key as keyof typeof showFeatureLabels;
                                    setShowFeatureLabels((old) => ({
                                      ...old,
                                      [labelKey]: !old[labelKey],
                                    }));
                                  }}
                                  style={{
                                    flex: "0 0 26px",
                                    width: 26,
                                    height: 24,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: showFeatureLabels[item.key as keyof typeof showFeatureLabels] ? "1px solid #0d9db5" : "1px solid #dbe5eb",
                                    borderRadius: 6,
                                    background: showFeatureLabels[item.key as keyof typeof showFeatureLabels] ? "#e5f8fb" : "#ffffff",
                                    color: showFeatureLabels[item.key as keyof typeof showFeatureLabels] ? "#087e95" : "#64748b",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  {item.key === "bangunan" || item.key === "tangki" ? "abc" : "123"}
                                </button>
                              )}
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
                      onClick={() => activateTerrain("dtm")}
                      aria-pressed={activeTerrain === "dtm"}
                      style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                        textAlign: "left", borderRadius: 10,
                        border: activeTerrain === "dtm" ? "2px solid #159bb2" : "1px solid #dce7eb",
                        background: activeTerrain === "dtm" ? "#f2fafb" : "#fff",
                        cursor: "pointer", color: "#284456",
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

          <div
            style={{
              position: "absolute",
              right: 10,
              bottom: 48,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              width: 48,
            }}
          >
            {measureResult && !(showProfileWindow && selectedMeasureTool === "profile") && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "fixed",
                  left: 16,
                  bottom: 88,
                  zIndex: 2147482000,
                  width: "min(360px, calc(100vw - 32px))",
                  boxSizing: "border-box",
                  padding: "10px 13px",
                  borderRadius: 12,
                  background: measureResult.startsWith("Aktifkan DTM Lokal:")
                    ? "rgba(255, 242, 242, 0.98)"
                    : "rgba(255,255,255,0.97)",
                  color: measureResult.startsWith("Aktifkan DTM Lokal:") ? "#8f3d43" : "#29485d",
                  border: measureResult.startsWith("Aktifkan DTM Lokal:")
                    ? "1px solid #f0c3c5"
                    : "1px solid #d8e5e8",
                  boxShadow: "0 4px 16px rgba(22,55,68,0.16)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{measureResult.replace("Aktifkan DTM Lokal: ", "")}</div>
                    {measureResult.startsWith("Aktifkan DTM Lokal:") && (
                      <button
                        type="button"
                        onClick={() => {
                          activateTerrain("dtm");
                          setMeasureResult("");
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          marginTop: 9,
                          padding: "7px 12px",
                          border: "1px solid #c94b50",
                          borderRadius: 8,
                          background: "#c94b50",
                          color: "#ffffff",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m3 20 7-14 4 8 2-3 5 9H3Z" />
                        </svg>
                        Aktifkan DTM
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Hapus hasil pengukuran"
                    onClick={() => {
                      setMeasureResult("");
                      setProfileSamples([]);
                      setShowProfileWindow(false);
                      measurePointsRef.current = [];
                      measureModeRef.current = null;
                      setMeasureMode(null);
                      setSelectedMeasureTool(null);
                      const map = mapRef.current;
                      (map?.getSource("measure-line") as maplibregl.GeoJSONSource | undefined)?.setData({
                        type: "Feature",
                        properties: { label: "" },
                        geometry: { type: "LineString", coordinates: [] },
                      });
                      (map?.getSource("measure-label-point") as maplibregl.GeoJSONSource | undefined)?.setData({
                        type: "FeatureCollection", features: [],
                      });
                      (map?.getSource("measure-area") as maplibregl.GeoJSONSource | undefined)?.setData({
                        type: "FeatureCollection", features: [],
                      });
                    }}
                    style={{ border: 0, background: "transparent", color: "#718096", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                  >×</button>
                </div>
              </div>
            )}
            {showProfileWindow && selectedMeasureTool === "profile" && profileSamples.length >= 2 && (
              <ElevationProfileWindow
                samples={profileSamples}
                onClose={() => setShowProfileWindow(false)}
              />
            )}
            {showMeasureMenu && (
              <div
                role="group"
                aria-label="Pilihan alat ukur"
                style={{
                  position: "absolute",
                  // Menu ringkas muncul di sisi kiri tombol pengukuran,
                  // sejajar dengan bagian atas tombol utama.
                  right: 54,
                  top: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 7,
                  padding: 0,
                  border: "none",
                  borderRadius: 0,
                  background: "transparent",
                  boxShadow: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {([
                  { key: "length", label: "Panjang", icon: "length" },
                  { key: "area", label: "Luas", icon: "area" },
                  { key: "height", label: "Tinggi", icon: "height" },
                ] as const).map((tool) => {
                  const isSelected = selectedMeasureTool === tool.key;
                  const isImplemented = true;
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() => {
                        setSelectedMeasureTool(tool.key);
                        setShowMeasureMenu(false);
                        const mode = tool.key;
                        const shouldStop = selectedMeasureTool === mode && measureModeRef.current === mode;
                        measureModeRef.current = shouldStop ? null : mode;
                        setMeasureMode(shouldStop ? null : mode);
                        measurePointsRef.current = [];
                        setMeasureResult("");
                        setProfileSamples([]);
                        setShowProfileWindow(false);
                        const lineSource = mapRef.current?.getSource("measure-line") as
                          | maplibregl.GeoJSONSource
                          | undefined;
                        lineSource?.setData({
                          type: "Feature",
                          properties: { label: "" },
                          geometry: { type: "LineString", coordinates: [] },
                        });
                        const labelSource = mapRef.current?.getSource("measure-label-point") as
                          | maplibregl.GeoJSONSource
                          | undefined;
                        labelSource?.setData({ type: "FeatureCollection", features: [] });
                        const areaSource = mapRef.current?.getSource("measure-area") as
                          | maplibregl.GeoJSONSource
                          | undefined;
                        areaSource?.setData({ type: "FeatureCollection", features: [] });
                        featurePopupRef.current?.remove();
                        featurePopupRef.current = null;
                      }}
                      title={
                        isImplemented
                          ? `Ukur ${tool.label.toLowerCase()}`
                          : `Menu ${tool.label.toLowerCase()} (fungsi pengukuran belum aktif)`
                      }
                      aria-label={tool.label}
                      aria-pressed={isSelected}
                      style={{
                        width: 132,
                        minWidth: 132,
                        height: 44,
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 9,
                        padding: "0 11px",
                        border: isSelected ? "1px solid #78c9bd" : "1px solid rgba(215,224,229,0.55)",
                        borderRadius: 10,
                        background: isSelected ? "#e8f6f4" : "#ffffff",
                        color: "#29485d",
                        fontSize: 15,
                        fontWeight: 600,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        touchAction: "manipulation",
                      }}
                    >
                      {tool.icon === "length" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 17.5 17.5 3 21 6.5 6.5 21 3 17.5Z" />
                          <path d="m7 13 2 2m1-6 2 2m1-6 2 2m-6 10 2 2" />
                        </svg>
                      ) : tool.icon === "area" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m5 4 14 2 2 12-13 2-4-9Z" />
                          <path d="M5 4 8 20" strokeDasharray="2 2" />
                        </svg>
                      ) : tool.icon === "height" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
                          <path d="M5 7h3M5 12h3M5 17h3M16 7h3M16 12h3M16 17h3" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 19h18M4 16l4-5 4 2 5-8 3 3" />
                          <circle cx="8" cy="11" r="1" />
                          <circle cx="12" cy="13" r="1" />
                          <circle cx="17" cy="5" r="1" />
                        </svg>
                      )}
                      <span>{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowMeasureMenu((open) => !open)}
              title={showMeasureMenu ? "Tutup menu pengukuran" : "Alat pengukuran"}
              aria-label={showMeasureMenu ? "Tutup menu pengukuran" : "Buka menu pengukuran"}
              aria-expanded={showMeasureMenu}
              aria-pressed={!!measureMode}
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                border: showMeasureMenu || measureMode || selectedMeasureTool !== null ? "1px solid #78c9bd" : "1px solid #d7e0e5",
                borderRadius: 10,
                background: showMeasureMenu || measureMode || selectedMeasureTool !== null ? "#29485d" : "#ffffff",
                color: showMeasureMenu || measureMode || selectedMeasureTool !== null ? "#ffffff" : "#29485d",
                boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17.5 17.5 3 21 6.5 6.5 21 3 17.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="m7 13 2 2m1-6 2 2m1-6 2 2m-6 10 2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              aria-label={streetViewPicking ? "Batalkan Street View" : "Pilih lokasi Street View"}
              title={streetViewPicking ? "Klik peta untuk memilih lokasi · klik lagi untuk batal" : "Street View"}
              aria-pressed={streetViewPicking}
              onClick={() => {
                const next = !streetViewPicking;
                streetViewPickRef.current = next;
                setStreetViewPicking(next);
                setShowMeasureMenu(false);
                if (next) {
                  measureModeRef.current = null;
                  setMeasureMode(null);
                }
              }}
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                padding: 0,
                border: streetViewPicking ? "1px solid #78c9bd" : "1px solid #d7e0e5",
                borderRadius: 10,
                background: streetViewPicking ? "#29485d" : "#ffffff",
                color: streetViewPicking ? "#ffffff" : "#29485d",
                boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="4.5" r="2" fill="currentColor" stroke="none" />
                <path d="M10 8.5 7.8 12l2.5 2 1.1-2 1.3 3.5-2.8 5M14 9l2.4 3.2 2.1.8M12 8l2.2 1.2 1.3 3.1M9.7 14l-2.5 5.5" />
              </svg>
            </button>

            <div
              role="group"
              aria-label="Kontrol zoom peta"
              style={{
                width: 44,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                border: "1px solid #d7e0e5",
                borderRadius: 10,
                background: "#ffffff",
                boxShadow: "0 2px 8px rgba(22,55,68,0.16)",
              }}
            >
              <button
                type="button"
                aria-label="Perbesar peta"
                title="Perbesar"
                onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
                style={{
                  width: 44,
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  border: 0,
                  borderBottom: "1px solid #e7eef1",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: 25,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Perkecil peta"
                title="Perkecil"
                onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
                style={{
                  width: 44,
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  border: 0,
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: 25,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                −
              </button>
            </div>

            {/* Reset arah utara: mengembalikan bearing dan pitch ke posisi awal. */}
            <button
              type="button"
              aria-label="Reset arah utara"
              title="Reset arah utara"
              onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 300 })}
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                padding: 0,
                border: "1px solid #d7e0e5",
                borderRadius: 10,
                background: "#ffffff",
                color: "#29485d",
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="m14.8 8.2-2 5-5 2 2-5 5-2Z" fill="currentColor" stroke="none" />
                <path d="M12 3v2M21 12h-2" />
              </svg>
            </button>

            {/* Profil elevasi sebagai tombol mandiri, bukan item menu pengukuran. */}
            <button
              type="button"
              aria-label={measureModeRef.current === "profile" ? "Hentikan Profil Elevasi" : "Profil Elevasi"}
              title="Profil elevasi"
              aria-pressed={measureMode === "profile"}
              onClick={() => {
                // Profil elevasi hanya tersedia jika DTM Lokal sedang aktif.
                // Jangan mulai menggambar jalur atau menampilkan pesan error
                // di pojok peta ketika sumber DTM belum diaktifkan.
                if (activeTerrain !== "dtm") {
                  setShowDtmRequiredNotice(true);
                  return;
                }

                const shouldStop = measureModeRef.current === "profile";
                setShowDtmRequiredNotice(false);
                setShowMeasureMenu(false);
                setSelectedMeasureTool("profile");
                measureModeRef.current = shouldStop ? null : "profile";
                setMeasureMode(shouldStop ? null : "profile");
                measurePointsRef.current = [];
                setMeasureResult(
                  shouldStop
                    ? ""
                    : "Profil elevasi: klik minimal dua titik pada peta, lalu klik dua kali untuk menyelesaikan dan melihat grafik.",
                );
                setProfileSamples([]);
                setShowProfileWindow(false);

                const map = mapRef.current;
                (map?.getSource("measure-line") as maplibregl.GeoJSONSource | undefined)?.setData({
                  type: "Feature",
                  properties: { label: "" },
                  geometry: { type: "LineString", coordinates: [] },
                });
                (map?.getSource("measure-label-point") as maplibregl.GeoJSONSource | undefined)?.setData({
                  type: "FeatureCollection",
                  features: [],
                });
                (map?.getSource("measure-area") as maplibregl.GeoJSONSource | undefined)?.setData({
                  type: "FeatureCollection",
                  features: [],
                });
                featurePopupRef.current?.remove();
                featurePopupRef.current = null;
              }}
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                padding: 0,
                border: measureMode === "profile" ? "1px solid #78c9bd" : "1px solid #d7e0e5",
                borderRadius: 10,
                background: measureMode === "profile" ? "#29485d" : "#ffffff",
                color: measureMode === "profile" ? "#ffffff" : "#29485d",
                boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 19h18M4 16l4-5 4 2 5-8 3 3" />
                <circle cx="8" cy="11" r="1" />
                <circle cx="12" cy="13" r="1" />
                <circle cx="17" cy="5" r="1" />
              </svg>
            </button>
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

          <div className={`stats-dock ${showStatsPanel ? "is-open" : "is-collapsed"} ${showProfileWindow && selectedMeasureTool === "profile" ? "profile-open" : ""}`}>
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
