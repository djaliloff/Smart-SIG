import React, { useState, useEffect, useCallback } from 'react';
import { createLocal, updateLocal, createPOI, updatePOI } from '../api';

/**
 * EditModal — Add/Edit a Local or POI.
 * Props:
 *   type        : 'local' | 'poi'
 *   initialData : existing record (for edit) or null (for create)
 *   onClose()
 *   onSaved(updatedGeoJSON) : called after successful save
 */
export default function EditModal({ type, initialData, onClose, onSaved }) {
  const isEdit = !!initialData;

  // ── Form state ──────────────────────────────────────────────
  const [name,          setName]          = useState(initialData?.name          ?? initialData?.address ?? '');
  const [address,       setAddress]       = useState(initialData?.address       ?? '');
  const [surfaceM2,     setSurfaceM2]     = useState(initialData?.surface_m2    ?? '');
  const [isActive,      setIsActive]      = useState(initialData?.is_active     ?? false);
  const [attractiveness,setAttractiveness]= useState(initialData?.attractiveness ?? 5);
  const [lon,           setLon]           = useState(initialData?.lon ?? initialData?.coordinates?.lon ?? '');
  const [lat,           setLat]           = useState(initialData?.lat ?? initialData?.coordinates?.lat ?? '');

  const [picking,  setPicking]  = useState(false);  // map-pick mode active
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  // ── Listen for map-picked coordinate ────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const { lon: pickedLon, lat: pickedLat } = e.detail;
      setLon(pickedLon.toFixed(6));
      setLat(pickedLat.toFixed(6));
      setPicking(false);
      window.dispatchEvent(new CustomEvent('djtsig-pickmode-stop'));
    };
    window.addEventListener('djtsig-location-picked', handler);
    return () => window.removeEventListener('djtsig-location-picked', handler);
  }, []);

  // Cleanup: exit pick mode if modal closes
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('djtsig-pickmode-stop'));
    };
  }, []);

  const startPicking = useCallback(() => {
    setPicking(true);
    window.dispatchEvent(new CustomEvent('djtsig-pickmode-start'));
  }, []);

  const stopPicking = useCallback(() => {
    setPicking(false);
    window.dispatchEvent(new CustomEvent('djtsig-pickmode-stop'));
  }, []);

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!lon || !lat) {
      setError('Veuillez sélectionner une position sur la carte.');
      return;
    }

    if (type === 'local') {
      if (!address || address.trim() === '') {
        setError('Adresse est obligatoire.');
        return;
      }
      if (surfaceM2 && parseFloat(surfaceM2) <= 0) {
        setError('La surface doit être supérieure à 0.');
        return;
      }
    } else {
      if (!name || name.trim() === '') {
        setError('Le nom du point d\'intérêt est obligatoire.');
        return;
      }
      if (attractiveness < 1 || attractiveness > 10) {
        setError('La note d\'attractivité doit être entre 1 et 10.');
        return;
      }
    }

    setSaving(true);
    try {
      let result;

      if (type === 'local') {
        const payload = {
          lon: parseFloat(lon),
          lat: parseFloat(lat),
          address,
          surface_m2: surfaceM2 ? parseFloat(surfaceM2) : null,
          is_active: isActive,
        };
        result = isEdit
          ? await updateLocal(initialData.id, payload)
          : await createLocal(payload);
      } else {
        const payload = {
          lon: parseFloat(lon),
          lat: parseFloat(lat),
          name,
          attractiveness: parseInt(attractiveness),
        };
        result = isEdit
          ? await updatePOI(initialData.id, payload)
          : await createPOI(payload);
      }

      setSuccess(true);
      setTimeout(() => {
        onSaved(result);
        onClose();
      }, 900);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur serveur. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  const entityLabel = type === 'local' ? 'Local' : "Point d'Intérêt";
  const verb = isEdit ? 'Modifier' : 'Ajouter';

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={picking ? undefined : onClose}
        style={{ cursor: picking ? 'crosshair' : 'default' }}
      />

      {/* Modal Box */}
      <div className="modal-box" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title-icon">{type === 'local' ? '🏢' : '⭐'}</span>
            {verb} {entityLabel}
          </div>
          {!picking && (
            <button className="modal-close-btn" onClick={onClose} aria-label="Fermer">✕</button>
          )}
        </div>

        {/* Pick-mode banner */}
        {picking && (
          <div className="pick-banner">
            <span className="pick-banner-dot" />
            <span>Cliquez sur la carte pour choisir l'emplacement…</span>
            <button className="pick-cancel-btn" onClick={stopPicking}>Annuler</button>
          </div>
        )}

        {/* Form */}
        {!picking && (
          <form className="modal-form" onSubmit={handleSubmit}>
            {/* Location picker */}
            <div className="modal-field">
              <label className="modal-label">📍 Position (WGS84)</label>
              <div className="modal-location-row">
                <input
                  className="modal-input modal-input-coord"
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={lon}
                  onChange={e => setLon(e.target.value)}
                />
                <input
                  className="modal-input modal-input-coord"
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-pick-map"
                  onClick={startPicking}
                  title="Choisir sur la carte"
                >
                  🗺️ Carte
                </button>
              </div>
              {lon && lat && (
                <div className="modal-coord-preview">
                  ✅ {parseFloat(lat).toFixed(5)}°N, {parseFloat(lon).toFixed(5)}°E
                </div>
              )}
            </div>

            {/* LOCAL-specific fields */}
            {type === 'local' && (
              <>
                <div className="modal-field">
                  <label className="modal-label">📫 Adresse complète</label>
                  <input
                    className="modal-input"
                    type="text"
                    placeholder="Ex: Quartier 2, Ali Mendjeli, Constantine"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">📐 Surface (m²)</label>
                  <input
                    className="modal-input"
                    type="number"
                    min="1"
                    placeholder="Ex: 80"
                    value={surfaceM2}
                    onChange={e => setSurfaceM2(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label modal-toggle-label">
                    <span>🔴 Marquer comme concurrent actif</span>
                    <label className="toggle-switch" style={{ marginLeft: 'auto' }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </label>
                  <p className="modal-hint">
                    {isActive
                      ? 'Ce local sera marqué comme concurrent existant (rouge sur la carte).'
                      : 'Ce local sera disponible pour évaluation (vert sur la carte).'}
                  </p>
                </div>
              </>
            )}

            {/* POI-specific fields */}
            {type === 'poi' && (
              <>
                <div className="modal-field">
                  <label className="modal-label">🏷️ Nom du point d'intérêt</label>
                  <input
                    className="modal-input"
                    type="text"
                    placeholder="Ex: École, Mosquée, Centre commercial…"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">
                    ⭐ Note d'attractivité &nbsp;
                    <strong style={{ color: 'var(--success)', fontFamily: 'var(--font-primary)' }}>
                      {attractiveness}/10
                    </strong>
                  </label>
                  <input
                    className="modal-range"
                    type="range"
                    min="1" max="10" step="1"
                    value={attractiveness}
                    onChange={e => setAttractiveness(e.target.value)}
                  />
                  <div className="modal-range-labels">
                    <span>1 — Faible</span>
                    <span>10 — Très attractif</span>
                  </div>
                </div>
              </>
            )}

            {/* Error / Success */}
            {error && (
              <div className="modal-alert modal-alert-error">⚠️ {error}</div>
            )}
            {success && (
              <div className="modal-alert modal-alert-success">
                ✅ {entityLabel} {isEdit ? 'mis à jour' : 'créé'} avec succès !
              </div>
            )}

            {/* Actions */}
            <div className="modal-actions">
              <button type="button" className="btn-modal-cancel" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="btn-modal-save" disabled={saving || success}>
                {saving ? '⏳ Enregistrement…' : `💾 ${verb}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
