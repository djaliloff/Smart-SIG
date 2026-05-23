import React, { useState } from 'react';
import { searchLocals } from '../api';

const scoreChipClass = (s) => s >= 65 ? 'score-chip-high' : s >= 35 ? 'score-chip-mid' : 'score-chip-low';

export default function SearchPanel({ onSelectLocal }) {
  const [q, setQ] = useState('');
  const [minSurface, setMinSurface] = useState('');
  const [maxSurface, setMaxSurface] = useState('');
  const [minScore, setMinScore] = useState('');
  const [results, setResults] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 30, offset: 0 };
      if (q.trim())        params.q = q.trim();
      if (minSurface)      params.min_surface = minSurface;
      if (maxSurface)      params.max_surface = maxSurface;
      if (minScore)        params.min_score = minScore;

      const data = await searchLocals(params);
      setResults(data.results);
      setTotal(data.total);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur de recherche.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search Input */}
      <div className="search-group">
        <div className="search-label">Rechercher un local</div>
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Adresse, quartier, zone..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="search-group">
        <div className="search-label">Surface (m²)</div>
        <div className="filter-row">
          <input
            className="filter-input"
            type="number"
            placeholder="Min m²"
            value={minSurface}
            onChange={e => setMinSurface(e.target.value)}
          />
          <input
            className="filter-input"
            type="number"
            placeholder="Max m²"
            value={maxSurface}
            onChange={e => setMaxSurface(e.target.value)}
          />
        </div>
      </div>

      <div className="search-group">
        <div className="search-label">Score minimum</div>
        <input
          className="filter-input"
          type="number"
          placeholder="Ex: 50 (score 0–100)"
          min={0} max={100}
          value={minScore}
          onChange={e => setMinScore(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        className="btn-search"
        onClick={handleSearch}
        disabled={loading}
      >
        {loading ? '⏳ Recherche...' : '🔎 Lancer la Recherche'}
      </button>

      {/* Results */}
      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--danger)', fontSize: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {results !== null && (
        <div className="section-header" style={{ marginTop: 4 }}>
          {total} local{total !== 1 ? 'aux' : ''} trouvé{total !== 1 ? 's' : ''}
        </div>
      )}

      {results?.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🏚️</div>
          <div className="empty-state-text">Aucun local ne correspond à vos critères.</div>
        </div>
      )}

      {results?.map((item) => (
        <div
          key={item.id}
          className="result-item"
          onClick={() => onSelectLocal(item)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSelectLocal(item)}
        >
          <div className={`result-score-chip ${scoreChipClass(item.location_score)}`}>
            {Math.round(item.location_score)}
            <span>pts</span>
          </div>
          <div className="result-info">
            <div className="result-address">{item.address || `Local #${item.id}`}</div>
            <div className="result-meta">
              {item.zone_name && <span className="result-tag">📍 {item.zone_name}</span>}
              {item.surface_m2 > 0 && <span className="result-tag">📐 {item.surface_m2} m²</span>}
              <span className="result-tag">🟢 Disponible</span>
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 14, alignSelf: 'center' }}>›</span>
        </div>
      ))}
    </div>
  );
}
