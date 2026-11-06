"use client";

import { createPortal } from "react-dom";
import { useMemo, useRef, useState } from "react";

type ElevationProfileSample = {
  distance: number;
  elevation: number | null;
  lng?: number;
  lat?: number;
};

type ElevationProfileWindowProps = {
  samples: ElevationProfileSample[];
  activeDistance?: number | null;
  onClose: () => void;
  isDarkMode?: boolean;
};

const formatDistance = (distance: number) =>
  distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance.toFixed(0)} m`;

export default function ElevationProfileWindow({
  samples,
  activeDistance,
  onClose,
  isDarkMode = false,
}: ElevationProfileWindowProps) {
  const [graphHoverDistance, setGraphHoverDistance] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const valid = useMemo(
    () => samples.filter(
      (sample): sample is ElevationProfileSample & { elevation: number } =>
        sample.elevation !== null && Number.isFinite(sample.elevation),
    ),
    [samples],
  );
  const elevations = valid.map((sample) => sample.elevation);
  const minElevation = elevations.length ? Math.min(...elevations) : 0;
  const maxElevation = elevations.length ? Math.max(...elevations) : 0;
  const elevationRange = maxElevation - minElevation || 1;
  const totalDistance = Math.max(samples[samples.length - 1]?.distance ?? 0, 1);
  const chart = { left: 66, right: 850, top: 22, bottom: 208 };
  const x = (distance: number) =>
    chart.left + (distance / totalDistance) * (chart.right - chart.left);
  const y = (elevation: number) =>
    chart.bottom - ((elevation - minElevation) / elevationRange) * (chart.bottom - chart.top);
  const linePoints = valid.map((sample) => `${x(sample.distance)},${y(sample.elevation)}`).join(" ");
  const areaPoints = valid.length
    ? `${x(valid[0].distance)},${chart.bottom} ${linePoints} ${x(valid[valid.length - 1].distance)},${chart.bottom}`
    : "";

  const shownDistance = activeDistance ?? graphHoverDistance;
  const activeSample = shownDistance === null || valid.length === 0
    ? null
    : valid.reduce((closest, sample) =>
        Math.abs(sample.distance - shownDistance) < Math.abs(closest.distance - shownDistance)
          ? sample
          : closest,
      valid[0]);

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || valid.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const viewX = ratio * 900;
    const distance = ((viewX - chart.left) / (chart.right - chart.left)) * totalDistance;
    setGraphHoverDistance(Math.max(0, Math.min(totalDistance, distance)));
  };

  const handlePointerLeave = () => setGraphHoverDistance(null);

  if (typeof document === "undefined") return null;

  const stats = [
    { label: "JARAK", value: formatDistance(totalDistance) },
    { label: "ELEVASI MINIMUM", value: `${minElevation.toFixed(2)} m` },
    { label: "ELEVASI MAKSIMUM", value: `${maxElevation.toFixed(2)} m` },
    { label: "RENTANG ELEVASI", value: `${(maxElevation - minElevation).toFixed(2)} m` },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Profil elevasi medan"
      style={{
        position: "fixed", inset: 0, zIndex: 2147483000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "16px 16px 24px", boxSizing: "border-box",
        background: "transparent", fontFamily: "inherit", pointerEvents: "none",
      }}
    >
      <section
        style={{
          position: "relative", width: "min(800px, calc(100vw - 32px))",
          maxHeight: "min(62vh, 500px)", overflowY: "auto",
          boxSizing: "border-box", padding: "14px 16px 12px", borderRadius: 16,
          background: isDarkMode ? "rgba(20,38,48,0.97)" : "#ffffff",
          color: isDarkMode ? "#e3edf1" : "#29485d",
          border: isDarkMode ? "1px solid #35515e" : "1px solid #dce8ec",
          boxShadow: isDarkMode ? "0 14px 40px rgba(0,0,0,0.42)" : "0 14px 40px rgba(22,55,68,0.22)",
          pointerEvents: "auto",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 750, letterSpacing: "-0.025em", color: isDarkMode ? "#e3edf1" : "#24495e" }}>Profil Elevasi</div>
            <div style={{ fontSize: 12, color: isDarkMode ? "#9aadb7" : "#718596", marginTop: 4 }}>Arahkan kursor ke garis magenta pada peta untuk melihat posisi elevasi</div>
          </div>
          <button type="button" aria-label="Tutup jendela profil elevasi" onClick={onClose}
            style={{ flex: "0 0 auto", width: 30, height: 30, border: isDarkMode ? "1px solid #35515e" : "1px solid #dbe6ea", borderRadius: 11, background: isDarkMode ? "#203b48" : "#f3f8fa", color: isDarkMode ? "#e3edf1" : "#29485d", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </header>

        {valid.length < 2 ? (
          <div style={{ padding: "28px 10px", textAlign: "center", fontSize: 12, color: isDarkMode ? "#a8bac3" : "#718096" }}>
            Data elevasi belum cukup untuk membentuk grafik. Pastikan DTM aktif dan tile elevasi tersedia.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8, marginBottom: 10 }}>
              {stats.map((item) => (
                <div key={item.label} style={{ minWidth: 0, padding: "8px 9px", borderRadius: 10, background: isDarkMode ? "#1b303b" : "#f3f8fa", border: isDarkMode ? "1px solid #35515e" : "1px solid #e2edf0" }}>
                  <div style={{ fontSize: 9, fontWeight: 750, letterSpacing: "0.045em", color: isDarkMode ? "#9aadb7" : "#718596", lineHeight: 1.35 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 750, color: isDarkMode ? "#8edce7" : "#24536a", marginTop: 5, whiteSpace: "nowrap" }}>{item.value}</div>
                </div>
              ))}
            </div>

            {activeSample && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "0 2px 8px", fontSize: 12, color: isDarkMode ? "#c4d7df" : "#496675" }}>
                <span><strong>Jarak:</strong> {formatDistance(activeSample.distance)}</span>
                <span><strong>Elevasi:</strong> {activeSample.elevation.toFixed(2)} m</span>
              </div>
            )}

            <div style={{ width: "100%", overflow: "hidden", borderRadius: 11, background: isDarkMode ? "#142630" : "#fcfefe", border: isDarkMode ? "1px solid #294653" : "1px solid #edf3f5", padding: "6px 6px 1px", boxSizing: "border-box" }}>
              <svg ref={svgRef} viewBox="0 0 900 250" role="img" aria-label="Grafik elevasi; arahkan kursor ke garis magenta pada peta"
                onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
                style={{ display: "block", width: "100%", height: "auto", cursor: "crosshair", touchAction: "pan-y" }}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const gridY = chart.top + (i / 4) * (chart.bottom - chart.top);
                  const value = maxElevation - (i / 4) * (maxElevation - minElevation);
                  return <g key={i}>
                    <line x1={chart.left} y1={gridY} x2={chart.right} y2={gridY} stroke={isDarkMode ? "#294653" : "#e4edf0"} strokeWidth="1" strokeDasharray="4 5" />
                    <text x={chart.left - 10} y={gridY + 4} textAnchor="end" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>{value.toFixed(2)} m</text>
                  </g>;
                })}
                <polygon points={areaPoints} fill="#19a6b5" opacity="0.16" />
                <polyline points={linePoints} fill="none" stroke="#078a9b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                {valid.map((sample, index) => <circle key={`${sample.distance}-${index}`} cx={x(sample.distance)} cy={y(sample.elevation)} r="3.5" fill={isDarkMode ? "#203b48" : "#ffffff"} stroke="#078a9b" strokeWidth="2" />)}
                {activeSample && <>
                  <line x1={x(activeSample.distance)} y1={chart.top} x2={x(activeSample.distance)} y2={chart.bottom} stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 4" />
                  <circle cx={x(activeSample.distance)} cy={y(activeSample.elevation)} r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                </>}
                <line x1={chart.left} y1={chart.bottom} x2={chart.right} y2={chart.bottom} stroke={isDarkMode ? "#496572" : "#b8cbd2"} strokeWidth="1.2" />
                <text x={chart.left} y="231" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>0 m</text>
                <text x={chart.right} y="231" textAnchor="end" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>{formatDistance(totalDistance)}</text>
                <text x={(chart.left + chart.right) / 2} y="246" textAnchor="middle" fontSize="10" fill={isDarkMode ? "#9aadb7" : "#647b89"}>Jarak sepanjang jalur</text>
              </svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 10, color: isDarkMode ? "#9aadb7" : "#718596" }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: "#078a9b", display: "inline-block" }} />
              <span>Profil elevasi</span><span style={{ marginLeft: 8, width: 7, height: 7, borderRadius: 99, background: "#f59e0b", display: "inline-block" }} />
              <span>Posisi kursor pada garis magenta di peta</span>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
