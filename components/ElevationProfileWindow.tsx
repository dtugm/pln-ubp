"use client";

import { createPortal } from "react-dom";

type ElevationProfileSample = {
  distance: number;
  elevation: number | null;
};

type ElevationProfileWindowProps = {
  samples: ElevationProfileSample[];
  onClose: () => void;
};

const formatDistance = (distance: number) =>
  distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance.toFixed(0)} m`;

export default function ElevationProfileWindow({
  samples,
  onClose,
}: ElevationProfileWindowProps) {
  // Render into document.body so MapView's transformed/clipped containers
  // cannot squeeze the profile window into a narrow strip.
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

  const chart = { left: 62, right: 744, top: 24, bottom: 220 };
  const x = (distance: number) =>
    chart.left + (distance / totalDistance) * (chart.right - chart.left);
  const y = (elevation: number) =>
    chart.bottom -
    ((elevation - minElevation) / elevationRange) * (chart.bottom - chart.top);
  const linePoints = valid
    .map((sample) => `${x(sample.distance)},${y(sample.elevation)}`)
    .join(" ");
  const areaPoints = valid.length
    ? `${x(valid[0].distance)},${chart.bottom} ${linePoints} ${x(valid[valid.length - 1].distance)},${chart.bottom}`
    : "";

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Profil elevasi medan"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        width: "min(820px, calc(100vw - 32px))",
        maxHeight: "min(58vh, 520px)",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "18px 20px 14px",
        borderRadius: 18,
        background: "rgba(255,255,255,0.98)",
        color: "#29485d",
        border: "1px solid #d8e5e8",
        boxShadow: "0 14px 42px rgba(22,55,68,0.28)",
        backdropFilter: "blur(12px)",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: "-0.02em" }}>Profil Elevasi</div>
          <div style={{ fontSize: 12, color: "#718096", marginTop: 4 }}>Penampang naik-turun permukaan sepanjang jalur pengukuran</div>
        </div>
        <button
          type="button"
          aria-label="Tutup jendela profil elevasi"
          onClick={onClose}
          style={{ flex: "0 0 auto", width: 34, height: 34, border: "1px solid #dbe6ea", borderRadius: 10, background: "#f2f8fa", color: "#29485d", cursor: "pointer", fontSize: 21, lineHeight: 1 }}
        >×</button>
      </div>

      {valid.length < 2 ? (
        <div style={{ padding: "28px 12px", textAlign: "center", fontSize: 13, color: "#718096" }}>Data elevasi belum cukup untuk membentuk grafik. Aktifkan Terrain 3D lalu gambar ulang jalurnya.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8, marginBottom: 12 }}>
            {[
              { label: "JARAK", value: formatDistance(totalDistance) },
              { label: "ELEVASI MIN.", value: `${minElevation.toFixed(2)} m` },
              { label: "ELEVASI MAKS.", value: `${maxElevation.toFixed(2)} m` },
              { label: "RENTANG ELEVASI", value: `${(maxElevation - minElevation).toFixed(2)} m` },
            ].map((item) => (
              <div key={item.label} style={{ minWidth: 0, padding: "9px 11px", borderRadius: 10, background: "#f2f8fa", border: "1px solid #e2edf0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#718096" }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 750, color: "#24536a", marginTop: 4 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ width: "100%", overflow: "hidden" }}>
            <svg viewBox="0 0 780 260" role="img" aria-label="Grafik naik turun elevasi sepanjang jalur" style={{ display: "block", width: "100%", height: "auto", minHeight: 150 }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const gridY = chart.top + (i / 4) * (chart.bottom - chart.top);
                const value = maxElevation - (i / 4) * (maxElevation - minElevation);
                return (
                  <g key={i}>
                    <line x1={chart.left} y1={gridY} x2={chart.right} y2={gridY} stroke="#e4edf0" strokeWidth="1" strokeDasharray="4 5" />
                    <text x={chart.left - 10} y={gridY + 4} textAnchor="end" fontSize="11" fill="#647b89">{value.toFixed(2)} m</text>
                  </g>
                );
              })}
              <polygon points={areaPoints} fill="#19a6b5" opacity="0.17" />
              <polyline points={linePoints} fill="none" stroke="#078a9b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              {valid.map((sample, index) => (
                <circle key={`${sample.distance}-${index}`} cx={x(sample.distance)} cy={y(sample.elevation)} r="3.5" fill="#ffffff" stroke="#078a9b" strokeWidth="2" />
              ))}
              <line x1={chart.left} y1={chart.bottom} x2={chart.right} y2={chart.bottom} stroke="#b8cbd2" strokeWidth="1.2" />
              <text x={chart.left} y="244" fontSize="11" fill="#647b89">0 m</text>
              <text x={chart.right} y="244" textAnchor="end" fontSize="11" fill="#647b89">{formatDistance(totalDistance)}</text>
              <text x={(chart.left + chart.right) / 2} y="258" textAnchor="middle" fontSize="10" fill="#647b89">Jarak sepanjang jalur</text>
            </svg>
          </div>
          <div style={{ fontSize: 11, color: "#718096", marginTop: 5 }}>Grafik menggunakan sampel elevasi yang dibaca dari Terrain 3D pada jalur yang digambar.</div>
        </>
      )}
    </div>,
    document.body,
  );
}
