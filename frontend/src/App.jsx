import React, { useState, useCallback, useEffect } from 'react';
import MapView from './components/MapView';
import ScoreCard from './components/ScoreCard';
import SearchPanel from './components/SearchPanel';
import LayerPanel from './components/LayerPanel';
import ManagePanel from './components/ManagePanel';
import Login from './components/Login';
import { scoreLocal } from './api';
import { LogOut, User } from 'lucide-react';

const MAP_THEMES = {
  dark:  'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/bright',
};

const DEFAULT_LAYERS = {
  zones: true,
  roads: true,
  locals: true,
  competitors: true,
  pois: true,
  population: true,
  buffers: true,
  accessibilite: true,
};

export const DEFAULT_LAYER_COLORS = {
  zones:       '#3b82f6',
  roads:       '#f59e0b',
  locals:      '#10b981',
  competitors: '#ef4444',
  pois:        '#8b5cf6',
  population:  '#06b6d4',
  buffers:     '#f97316',
  accessibilite: '#14b8a6',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('score');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState(DEFAULT_LAYERS);
  const [layerColors, setLayerColors] = useState(DEFAULT_LAYER_COLORS);
  const [mapTheme, setMapTheme] = useState('light');

  const hasGestionAccess = user && (user.role === 'admin' || user.role === 'gestionnaire');
  const hasSearchAccess = user && user.role !== 'client_simple';
  const hasScoreAccess = user && user.role !== 'client_simple';

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    if (user) {
      if (sidebarTab === 'manage' && !hasGestionAccess) {
        setSidebarTab(hasScoreAccess ? 'score' : 'layers');
      }
      if (sidebarTab === 'search' && !hasSearchAccess) {
        setSidebarTab(hasScoreAccess ? 'score' : 'layers');
      }
      if (sidebarTab === 'score' && !hasScoreAccess) {
        setSidebarTab('layers');
      }
    }
  }, [user, sidebarTab, hasGestionAccess, hasSearchAccess, hasScoreAccess]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Administrateur',
      gestionnaire: 'Gestionnaire',
      client_simple: 'Client Simple',
      client_abonne: 'Client Abonné'
    };
    return labels[role] || role;
  };

  const toggleMapTheme = useCallback(() => {
    setMapTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const handleScoreResult = useCallback((data) => {
    if (!hasScoreAccess) return;
    setScoreData(data);
    setSidebarTab('score');
    if (sidebarCollapsed) setSidebarCollapsed(false);
  }, [hasScoreAccess, sidebarCollapsed]);

  const toggleLayer = useCallback((layerId) => {
    setVisibleLayers(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const changeLayerColor = useCallback((layerId, color) => {
    setLayerColors(prev => ({ ...prev, [layerId]: color }));
  }, []);

  const handleSelectSearchResult = useCallback(async (item) => {
    if (!hasSearchAccess || !hasScoreAccess) return;
    window.dispatchEvent(new CustomEvent('djtsig-flyto', {
      detail: { lon: item.coordinates.lon, lat: item.coordinates.lat }
    }));
    setLoading(true);
    setSidebarTab('score');
    try {
      const result = await scoreLocal(item.id);
      setScoreData(result);
    } catch (e) {
      setScoreData({
        local: item,
        score: { final_score: item.location_score, breakdown: {} },
      });
    } finally {
      setLoading(false);
    }
  }, [hasSearchAccess, hasScoreAccess]);

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-logo">
          <div className="header-logo-icon">🗺️</div>
          <div>
            <div className="header-logo-text">DJT-SIG</div>
            <div className="header-subtitle">Système d'Aide à la Décision Spatiale</div>
          </div>
        </div>

        <div className="header-mode-tabs">
          {hasScoreAccess && (
            <button
              className={`header-mode-tab ${!sidebarCollapsed && sidebarTab === 'score' ? 'active' : ''}`}
              onClick={() => { setSidebarTab('score'); setSidebarCollapsed(false); }}
            >
              📊 Évaluation
            </button>
          )}
          {hasSearchAccess && (
            <button
              className={`header-mode-tab ${!sidebarCollapsed && sidebarTab === 'search' ? 'active' : ''}`}
              onClick={() => { setSidebarTab('search'); setSidebarCollapsed(false); }}
            >
              🔍 Recherche
            </button>
          )}
          <button
            className={`header-mode-tab ${!sidebarCollapsed && sidebarTab === 'layers' ? 'active' : ''}`}
            onClick={() => { setSidebarTab('layers'); setSidebarCollapsed(false); }}
          >
            🗺️ Couches
          </button>
          {hasGestionAccess && (
            <button
              className={`header-mode-tab ${!sidebarCollapsed && sidebarTab === 'manage' ? 'active' : ''}`}
              onClick={() => { setSidebarTab('manage'); setSidebarCollapsed(false); }}
            >
              ⚙️ Gestion
            </button>
          )}
        </div>

        <div className="header-spacer" />

        <div className="header-user">
          <div className="user-info">
            <User size={18} />
            <div>
              <div className="user-name">{user.username}</div>
              <div className="user-role">{getRoleLabel(user.role)}</div>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout} title="Se déconnecter">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── Map ──────────────────────────────────────────── */}
      <MapView
        visibleLayers={visibleLayers}
        layerColors={layerColors}
        onScoreResult={hasScoreAccess ? handleScoreResult : undefined}
        onLoading={setLoading}
        mapStyle={MAP_THEMES[mapTheme]}
        disableScore={!hasScoreAccess}
      />

      {/* ── Map Theme Toggle ──────────────────────────────── */}
      <button
        className="map-theme-toggle"
        onClick={toggleMapTheme}
        title={mapTheme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
      >
        <span className="theme-icon">{mapTheme === 'dark' ? '☀️' : '🌙'}</span>
        <span>{mapTheme === 'dark' ? 'Clair' : 'Sombre'}</span>
      </button>

      {/* ── Sidebar Open Button (when collapsed) ─────────── */}
      {sidebarCollapsed && (
        <button
          className="sidebar-open-btn"
          onClick={() => setSidebarCollapsed(false)}
          title="Ouvrir le panneau"
        >
          ◀ Panneau
        </button>
      )}

      {/* ── Map Hint ─────────────────────────────────────── */}
      {hasScoreAccess && !scoreData && !loading && (
        <div className="map-hint">
          🖱️ Cliquez sur la carte pour analyser un emplacement — ou sélectionnez un local disponible 🟢
        </div>
      )}

      {/* ── Loading Pulse ─────────────────────────────────── */}
      {loading && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-bright)',
          borderRadius: 24,
          padding: '10px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backdropFilter: 'blur(10px)',
          boxShadow: 'var(--shadow-glow)',
        }}>
          <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Analyse spatiale en cours…</span>
        </div>
      )}

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Collapse Toggle */}
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(true)}
          title="Fermer le panneau"
        >
          Fermer
        </button>

        {/* Tabs */}
        <div className="sidebar-tabs">
          {hasScoreAccess && (
            <button
              key="score"
              className={`sidebar-tab ${sidebarTab === 'score' ? 'active' : ''}`}
              onClick={() => setSidebarTab('score')}
            >
              📊 Score
            </button>
          )}
          {hasSearchAccess && (
            <button
              key="search"
              className={`sidebar-tab ${sidebarTab === 'search' ? 'active' : ''}`}
              onClick={() => setSidebarTab('search')}
            >
              🔍 Recherche
            </button>
          )}
          <button
            key="layers"
            className={`sidebar-tab ${sidebarTab === 'layers' ? 'active' : ''}`}
            onClick={() => setSidebarTab('layers')}
          >
            🗺️ Couches
          </button>
          {hasGestionAccess && (
            <button
              key="manage"
              className={`sidebar-tab ${sidebarTab === 'manage' ? 'active' : ''}`}
              onClick={() => setSidebarTab('manage')}
            >
              ⚙️ Gestion
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="sidebar-content">
          {/* Score Tab */}
          {hasScoreAccess && sidebarTab === 'score' && (
            <>
              {loading && (
                <div className="loading-overlay">
                  <div className="spinner" />
                  <span style={{ fontSize: 12 }}>Calcul du score en cours…</span>
                </div>
              )}
              {!loading && !scoreData && (
                <div className="empty-state">
                  <div className="empty-state-icon">🖱️</div>
                  <div className="empty-state-text">
                    Cliquez n'importe où sur la carte pour obtenir le score de l'emplacement,
                    ou sélectionnez un local disponible <strong style={{ color: 'var(--success)' }}>🟢</strong>.
                  </div>
                </div>
              )}
              {!loading && scoreData && (
                <ScoreCard
                  data={scoreData}
                  title={scoreData.local ? 'Local Disponible' : 'Emplacement Personnalisé'}
                />
              )}
            </>
          )}

          {/* Search Tab */}
          {hasSearchAccess && sidebarTab === 'search' && (
            <SearchPanel onSelectLocal={handleSelectSearchResult} />
          )}

          {/* Layers Tab */}
          {sidebarTab === 'layers' && (
            <LayerPanel
              visibleLayers={visibleLayers}
              layerColors={layerColors}
              onToggleLayer={toggleLayer}
              onChangeColor={changeLayerColor}
            />
          )}

          {/* Manage Tab */}
          {hasGestionAccess && sidebarTab === 'manage' && (
            <ManagePanel />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>DJT-SIG © 2025</span>
          <span>SRID 32632 · UTM 32N</span>
        </div>
      </aside>
    </div>
  );
}
