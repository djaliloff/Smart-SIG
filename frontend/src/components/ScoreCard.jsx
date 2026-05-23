import React, { useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

// ─── Score Gauge ─────────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = score >= 65 ? 'var(--success)' : score >= 35 ? 'var(--warning)' : 'var(--danger)';
  const badge = score >= 65 ? { cls: 'badge-excellent', label: 'Excellent' }
    : score >= 35           ? { cls: 'badge-good',      label: 'Bon' }
    :                         { cls: 'badge-poor',      label: 'Faible' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div className="score-gauge">
        <svg width="70" height="70" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="35" cy="35" r={r}
            fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="score-gauge-value">
          {score}<span className="score-gauge-label">/ 100</span>
        </div>
      </div>
      <span className={`score-badge ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

// ─── Factor Row ───────────────────────────────────────────────────────────────
function FactorRow({ num, label, pts, max, color = 'var(--primary)' }) {
  const pct = Math.min(100, (pts / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Number badge */}
      <span style={{
        minWidth: 20, height: 20, borderRadius: '50%',
        background: 'rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
      }}>{num}</span>

      {/* Label */}
      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>

      {/* Progress bar */}
      <div style={{ flex: 2, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: color,
          transition: 'width 0.6s ease',
          boxShadow: `0 0 6px ${color}55`,
        }} />
      </div>

      {/* pts / max */}
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 44, textAlign: 'right' }}>
        {pts.toFixed(1)}<span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>/{max}</span>
      </span>
    </div>
  );
}

// ─── Breakdown Item ───────────────────────────────────────────────────────────
function BreakdownItem({ icon, label, value, unit }) {
  return (
    <div className="breakdown-item">
      <span className="breakdown-icon">{icon}</span>
      <div className="breakdown-label">{label}</div>
      <div className="breakdown-value">
        {value ?? '—'}
        {unit && <span className="breakdown-unit"> {unit}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ScoreCard({ data, title = "Analyse de l'Emplacement" }) {
  if (!data) return null;
  const { score } = data;
  const b = score.breakdown;

  // ── Compute each component's individual score (mirrors the SQL formula) ──
  const factors = useMemo(() => {
    // ① Population (0–25)
    const pop = Math.min(25, (b.population_1km / 10000) * 25);

    // ② Road visibility (0–20)
    const d = b.dist_to_road_m;
    const road = d == null ? 0
      : d <= 50  ? 20
      : d <= 500 ? 20 * (1 - (d - 50) / 450)
      : 0;

    // ③ POI attractiveness (0–25)
    const poi = Math.min(25, b.pois_500m * 3 + (b.poi_attractiveness_sum / 10) * 4);

    // ④ Pedestrian accessibility (0–15)
    const t = b.avg_travel_min ?? 15;
    const access = Math.max(0, Math.min(15, 15 * (1 - (t - 5) / 25)));

    // ⑤ Competitive opportunity (0–15)
    const opport = Math.max(0, 15 - b.competitors_500m * 4 - b.buffer_overlaps * 2);

    return { pop, road, poi, access, opport };
  }, [b]);

  // ── Radar data ──
  const radarData = useMemo(() => [
    { subject: 'Population',   A: (factors.pop    / 25)  * 100 },
    { subject: 'Visibilité',   A: (factors.road   / 20)  * 100 },
    { subject: 'Attractivité', A: (factors.poi    / 25)  * 100 },
    { subject: 'Accessibilité',A: (factors.access / 15)  * 100 },
    { subject: 'Opportunité',  A: (factors.opport / 15)  * 100 },
  ], [factors]);

  return (
    <div className="score-card">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="score-card-header">
        <ScoreGauge score={score.final_score} />
        <div className="score-info">
          <div className="score-title">{title}</div>
          {data.local && (
            <div className="score-address">{data.local.address || 'Coordonnée personnalisée'}</div>
          )}
          {data.coordinates && (
            <div className="score-address">
              {parseFloat(data.coordinates.lat).toFixed(5)}°N,{' '}
              {parseFloat(data.coordinates.lon).toFixed(5)}°E
            </div>
          )}
          {b.zone && b.zone !== 'Hors zone' && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>📍</span> {b.zone}
            </div>
          )}
        </div>
      </div>

      {/* ── Radar chart ────────────────────────────────────────────────────── */}
      <div style={{ height: 155, padding: '6px 4px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius={52}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
            <Radar name="Score" dataKey="A"
              stroke="var(--primary)" fill="var(--primary)"
              fillOpacity={0.2} strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Factor scores (all 5, with progress bars) ──────────────────────── */}
      <div style={{ padding: '8px 14px 4px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
          Détail des composantes
        </div>
        <FactorRow num="①" label="Population 1 km"       pts={factors.pop}    max={25} color="var(--primary)" />
        <FactorRow num="②" label="Visibilité Route"       pts={factors.road}   max={20} color="var(--accent)"  />
        <FactorRow num="③" label="Attractivité POIs"      pts={factors.poi}    max={25} color="#f59e0b"        />
        <FactorRow num="④" label="Accessibilité piétonne" pts={factors.access} max={15} color="#10b981"        />
        <FactorRow num="⑤" label="Opportunité concurr."  pts={factors.opport} max={15} color="#e879f9"        />
      </div>

      {/* ── Raw data breakdown ─────────────────────────────────────────────── */}
      <div style={{ padding: '6px 14px 2px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
          Données brutes
        </div>
      </div>
      <div className="breakdown-grid">
        <BreakdownItem icon="👥" label="Population 1km"      value={b.population_1km?.toLocaleString('fr-DZ')} unit="hab" />
        <BreakdownItem icon="🛣️" label="Distance Route"      value={b.dist_to_road_m}       unit="m"       />
        <BreakdownItem icon="🛤️" label="Type Voie"            value={b.nearest_road_type || '—'}             />
        <BreakdownItem icon="⭐" label="POIs 500m"            value={b.pois_500m}            unit=""        />
        <BreakdownItem icon="✨" label="Attractivité POI"     value={b.poi_attractiveness_sum} unit="pts"   />
        <BreakdownItem icon="🚶" label="Temps marche moy."    value={b.avg_travel_min}       unit="min"     />
        <BreakdownItem icon="🏪" label="Concurrents 500m"    value={b.competitors_500m}     unit=""        />
        <BreakdownItem icon="🔴" label="Zones tampon"         value={b.buffer_overlaps}      unit="buffer(s)" />
      </div>

      {data.local && (
        <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
          <div className="result-tag">📐 {data.local.surface_m2 ?? '—'} m²</div>
          <div className="result-tag">{data.local.is_active ? '🔴 Actif' : '🟢 Disponible'}</div>
        </div>
      )}
    </div>
  );
}