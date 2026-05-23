import React, { useState, useRef, useEffect } from 'react';

const LAYER_DEFS = [
  { id: 'zones',       label: 'Quartiers',         icon: '🗺️' },
  { id: 'roads',       label: 'Réseau Routier',     icon: '🛣️' },
  { id: 'locals',      label: 'Locaux Disponibles', icon: '🏢' },
  { id: 'competitors', label: 'Concurrents Actifs', icon: '🏪' },
  { id: 'pois',        label: "Points d'Intérêt",   icon: '⭐' },
  { id: 'population',  label: 'Densité Pop.',       icon: '👥' },
  { id: 'buffers',     label: 'Buffers',            icon: '📏' },
  { id: 'accessibilite', label: 'Accessibilité',    icon: '🚗' },
];

// Beautiful preset palette for each layer
const PRESETS = [
  '#3b82f6', '#60a5fa', '#1d4ed8', '#06b6d4', '#0ea5e9',
  '#10b981', '#34d399', '#6ee7b7', '#f59e0b', '#fbbf24',
  '#ef4444', '#f87171', '#fb923c', '#8b5cf6', '#a78bfa',
  '#ec4899', '#f43f5e', '#e11d48', '#14b8a6', '#84cc16',
  '#ffffff', '#94a3b8', '#475569', '#1e293b', '#000000',
];

function ColorPickerPopover({ color, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="color-popover" ref={ref}>
      <div className="color-popover-title">Choisir une couleur</div>

      {/* Preset swatches */}
      <div className="color-swatches">
        {PRESETS.map(preset => (
          <button
            key={preset}
            className={`color-swatch ${color === preset ? 'active' : ''}`}
            style={{ background: preset }}
            onClick={() => { onChange(preset); onClose(); }}
            title={preset}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="color-popover-divider" />

      {/* Custom hex input + native color picker */}
      <div className="color-custom-row">
        <div className="color-native-wrap">
          <input
            type="color"
            className="color-native-input"
            value={color}
            onChange={e => onChange(e.target.value)}
          />
          <span className="color-native-label">🎨</span>
        </div>
        <input
          type="text"
          className="color-hex-input"
          value={color}
          maxLength={7}
          onChange={e => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          spellCheck={false}
          placeholder="#000000"
        />
        <button className="color-apply-btn" onClick={onClose}>✓</button>
      </div>
    </div>
  );
}

export default function LayerPanel({ visibleLayers, layerColors, onToggleLayer, onChangeColor }) {
  const [openPicker, setOpenPicker] = useState(null); // layer id or null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-header">Couches cartographiques</div>

      <div className="layer-controls">
        {LAYER_DEFS.map(layer => {
          const color = layerColors[layer.id];
          const visible = !!visibleLayers[layer.id];
          const isOpen = openPicker === layer.id;

          return (
            <div key={layer.id} className="layer-item-wrap">
              <div
                className={`layer-item ${!visible ? 'layer-item-dimmed' : ''}`}
                onClick={() => onToggleLayer(layer.id)}
              >
                {/* Color swatch button */}
                <button
                  className={`color-swatch-btn ${isOpen ? 'color-swatch-btn-open' : ''}`}
                  style={{
                    background: visible ? color : 'var(--text-muted)',
                    boxShadow: visible ? `0 0 8px ${color}88` : 'none',
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setOpenPicker(isOpen ? null : layer.id);
                  }}
                  title="Changer la couleur"
                >
                  <span className="color-swatch-btn-icon">✎</span>
                </button>

                <div className="layer-label">
                  <span style={{ fontSize: 14 }}>{layer.icon}</span>
                  <span style={{
                    fontSize: 12,
                    color: visible ? 'var(--text-primary)' : 'var(--text-muted)',
                    transition: 'color 0.25s',
                    fontWeight: 500,
                  }}>
                    {layer.label}
                  </span>
                </div>

                <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => onToggleLayer(layer.id)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Color picker popover */}
              {isOpen && (
                <ColorPickerPopover
                  color={color}
                  onChange={c => onChangeColor(layer.id, c)}
                  onClose={() => setOpenPicker(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="section-header" style={{ marginTop: 8 }}>Légende Score</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: '≥ 65 — Excellent', color: '#10b981' },
          { label: '35–64 — Bon',      color: '#f59e0b' },
          { label: '< 35 — Faible',    color: '#ef4444' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
