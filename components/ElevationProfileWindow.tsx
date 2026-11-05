"use client";

import { createPortal } from "react-dom";

type ElevationProfileSample = {
  distance: number;
  elevation: number | null;
};

type ElevationProfileWindowProps = {
  samples: ElevationProfileSample[];
  onClose: () => void;
  isDarkMode?: boolean;
};

const formatDistance = (distance: number) =>
  distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance.toFixed(0)} m`;

export default function ElevationProfileWindow({ samples, onClose, isDarkMode = false }: ElevationProfileWindowProps) {
  if (typeof document === "undefined") return null;

  const valid = samples.filter(
    (sample): sample is { distance: number; elevation: number } =>
      sample.elevation !== null && Number.isFinite(sample.elevation),
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
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "16px 16px 24px",
        boxSizing: "border-box",
        background: "transparent",
        fontFamily: "inherit",
      }}
    >
      <section
        style={{
          position: "relative",
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "min(58vh, 460px)",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: "14px 16px 12px",
          borderRadius: 16,
          background: isDarkMode ? "rgba(20,38,48,0.97)" : "#ffffff",
          color: isDarkMode ? "#e3edf1" : "#29485d",
          border: isDarkMode ? "1px solid #35515e" : "1px solid #dce8ec",
          boxShadow: isDarkMode ? "0 14px 40px rgba(0,0,0,0.42)" : "0 14px 40px rgba(22,55,68,0.22)",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 750, letterSpacing: "-0.025em", color: isDarkMode ? "#e3edf1" : "#24495e" }}>Profil Elevasi</div>
            <div style={{ fontSize: 12, color: isDarkMode ? "#9aadb7" : "#718596", marginTop: 4 }}>Penampang ketinggian sepanjang jalur pengukuran</div>
          </div>
          <button
            type="button"
            aria-label="Tutup jendela profil elevasi"
            onClick={onClose}
            style={{ flex: "0 0 auto", width: 30, height: 30, border: isDarkMode ? "1px solid #35515e" : "1px solid #dbe6ea", borderRadius: 11, background: isDarkMode ? "#203b48" : "#f3f8fa", color: isDarkMode ? "#e3edf1" : "#29485d", cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >×</button>
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

            <div style={{ width: "100%", overflow: "hidden", borderRadius: 11, background: isDarkMode ? "#142630" : "#fcfefe", border: isDarkMode ? "1px solid #294653" : "1px solid #edf3f5", padding: "6px 6px 1px", boxSizing: "border-box" }}>
              <svg viewBox="0 0 900 250" role="img" aria-label="Grafik naik turun elevasi sepanjang jalur" style={{ display: "block", width: "100%", height: "auto" }}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const gridY = chart.top + (i / 4) * (chart.bottom - chart.top);
                  const value = maxElevation - (i / 4) * (maxElevation - minElevation);
                  return (
                    <g key={i}>
                      <line x1={chart.left} y1={gridY} x2={chart.right} y2={gridY} stroke={isDarkMode ? "#294653" : "#e4edf0"} strokeWidth="1" strokeDasharray="4 5" />
                      <text x={chart.left - 10} y={gridY + 4} textAnchor="end" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>{value.toFixed(2)} m</text>
                    </g>
                  );
                })}
                <polygon points={areaPoints} fill="#19a6b5" opacity="0.16" />
                <polyline points={linePoints} fill="none" stroke="#078a9b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                {valid.map((sample, index) => (
                  <circle key={`${sample.distance}-${index}`} cx={x(sample.distance)} cy={y(sample.elevation)} r="3.5" fill={isDarkMode ? "#203b48" : "#ffffff"} stroke="#078a9b" strokeWidth="2" />
                ))}
                <line x1={chart.left} y1={chart.bottom} x2={chart.right} y2={chart.bottom} stroke={isDarkMode ? "#496572" : "#b8cbd2"} strokeWidth="1.2" />
                <text x={chart.left} y="231" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>0 m</text>
                <text x={chart.right} y="231" textAnchor="end" fontSize="11" fill={isDarkMode ? "#9aadb7" : "#647b89"}>{formatDistance(totalDistance)}</text>
                <text x={(chart.left + chart.right) / 2} y="246" textAnchor="middle" fontSize="10" fill={isDarkMode ? "#9aadb7" : "#647b89"}>Jarak sepanjang jalur</text>
              </svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 9, color: isDarkMode ? "#9aadb7" : "#718596" }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: "#078a9b", display: "inline-block" }} />

            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}

