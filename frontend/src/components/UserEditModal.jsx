import React, { useState, useEffect } from 'react';
import { register, updateUser } from '../api';

export default function UserEditModal({ initialData, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'client_simple',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originalRole, setOriginalRole] = useState(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        username: initialData.username,
        email: initialData.email,
        password: '',
        role: initialData.role,
        is_active: initialData.is_active
      });
      setOriginalRole(initialData.role);
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Confirmation prompt when changing role
    if (initialData && originalRole && formData.role !== originalRole) {
      const confirmed = window.confirm(
        `Êtes-vous sûr de vouloir changer le rôle de "${initialData.username}" de "${getRoleLabel(originalRole)}" à "${getRoleLabel(formData.role)}" ?`
      );
      if (!confirmed) {
        return;
      }
    }

    setLoading(true);

    try {
      if (initialData) {
        const dataToSend = { ...formData };
        if (!dataToSend.password) {
          delete dataToSend.password;
        }
        await updateUser(initialData.id, dataToSend);
      } else {
        if (!formData.password) {
          setError('Le mot de passe est requis pour créer un utilisateur');
          return;
        }
        await register(formData);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {initialData ? '✏️ Modifier l\'utilisateur' : '➕ Ajouter un utilisateur'}
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="modal-alert modal-alert-error">
              {error}
            </div>
          )}

          <div className="modal-field">
            <label className="modal-label">Nom d'utilisateur</label>
            <input
              type="text"
              className="modal-input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Email</label>
            <input
              type="email"
              className="modal-input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">
              Mot de passe {initialData && '(laisser vide pour conserver)'}
            </label>
            <input
              type="password"
              className="modal-input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!initialData}
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Rôle</label>
            <select
              className="modal-input modal-select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value="client_simple">{getRoleLabel('client_simple')}</option>
              <option value="client_abonne">{getRoleLabel('client_abonne')}</option>
              <option value="gestionnaire">{getRoleLabel('gestionnaire')}</option>
              <option value="admin">{getRoleLabel('admin')}</option>
            </select>
          </div>

          <div className="modal-field">
            <label className="modal-label modal-toggle-label">
              Compte actif
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <div className="toggle-slider"></div>
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-modal-save" disabled={loading}>
              {loading ? 'Enregistrement...' : (initialData ? 'Mettre à jour' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
