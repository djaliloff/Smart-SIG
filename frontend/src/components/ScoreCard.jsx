import React, { useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

const SCORE_BOUNDS = {
  population_1km:        { max: 10000, label: 'Population', icon: '👥', unit: 'hab' },
  dist_to_road_m:        { max: 500,   label: 'Visibilité Route', icon: '🛣️', unit: 'm', inverse: true },
  competitors_500m:      { max: 5,     label: 'Concurrents', icon: '🏪', unit: '', inverse: true },
  pois_500m:             { max: 10,    label: 'POIs Proches', icon: '⭐', unit: '' },
  poi_attractiveness_sum:{ max: 50,    label: 'Attractivité', icon: '✨', unit: 'pts' },
};

function ScoreGauge({ score }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  const color = score >= 65 ? 'var(--success)' : score >= 35 ? 'var(--warning)' : 'var(--danger)';
  const badge = score >= 65 ? { cls: 'badge-excellent', label: 'Excellent' }
    : score >= 35 ? { cls: 'badge-good', label: 'Bon' }
    : { cls: 'badge-poor', label: 'Faible' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div className="score-gauge">
        <svg width="70" height="70" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="35" cy="35" r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="score-gauge-value">
          {score}
          <span className="score-gauge-label">/ 100</span>
        </div>
      </div>
      <span className={`score-badge ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

function BreakdownItem({ icon, label, value, unit, inverse }) {
  return (
    <div className="breakdown-item">
      <span className="breakdown-icon">{icon}</span>
      <div className="breakdown-label">{label}</div>
      <div className="breakdown-value">
        {value ?? '—'}
        {unit && <span className="breakdown-unit">{unit}</span>}
      </div>
    </div>
  );
}

export default function ScoreCard({ data, title = 'Analyse de l\'Emplacement' }) {
  if (!data) return null;
  const { score } = data;
  const b = score.breakdown;

  const radarData = useMemo(() => [
    { subject: 'Population',    A: Math.min(100, (b.population_1km / 10000) * 100) },
    { subject: 'Visibilité',    A: b.dist_to_road_m <= 50 ? 100 : b.dist_to_road_m <= 500 ? Math.max(0, 100 - ((parseFloat(b.dist_to_road_m) - 50) / 450) * 100) : 0 },
    { subject: 'Attractivité',  A: Math.min(100, b.pois_500m * 10) },
    { subject: 'POI Score',     A: Math.min(100, (b.poi_attractiveness_sum / 50) * 100) },
    { subject: 'Isolation',     A: Math.max(0, 100 - b.competitors_500m * 20) },
  ], [b]);

  return (
    <div className="score-card">
      <div className="score-card-header">
        <ScoreGauge score={score.final_score} />
        <div className="score-info">
          <div className="score-title">{title}</div>
          {data.local && (
            <div className="score-address">{data.local.address || 'Coordonnée personnalisée'}</div>
          )}
          {data.coordinates && (
            <div className="score-address">
              {parseFloat(data.coordinates.lat).toFixed(5)}°N, {parseFloat(data.coordinates.lon).toFixed(5)}°E
            </div>
          )}
          {b.zone && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>📍</span> {b.zone}
            </div>
          )}
        </div>
      </div>

      {/* Radar Chart */}
      <div style={{ height: 160, padding: '8px 4px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius={55}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
            <Radar
              name="Score"
              dataKey="A"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Grid */}
      <div className="breakdown-grid">
        <BreakdownItem icon="👥" label="Population 1km" value={b.population_1km?.toLocaleString('fr-DZ')} unit="hab" />
        <BreakdownItem icon="🛣️" label="Distance Route" value={b.dist_to_road_m} unit="m" />
        <BreakdownItem icon="🏪" label="Concurrents 500m" value={b.competitors_500m} unit="" />
        <BreakdownItem icon="⭐" label="POIs 500m" value={b.pois_500m} unit="" />
        <BreakdownItem icon="✨" label="Attractivité" value={b.poi_attractiveness_sum} unit="pts" />
        <BreakdownItem icon="🛣️" label="Type Voie" value={b.nearest_road_type || '—'} unit="" />
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
