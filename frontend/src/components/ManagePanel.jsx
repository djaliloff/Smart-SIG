import React, { useState, useEffect } from 'react';
import { listLocals, listPOIs, deleteLocal, deletePOI, getUsers, deleteUser, getMe } from '../api';
import EditModal from './EditModal';
import UserEditModal from './UserEditModal';

export default function ManagePanel() {
  const [activeTab, setActiveTab] = useState('locals'); // 'locals' | 'pois' | 'users'
  const [currentUser, setCurrentUser] = useState(null);

  const [locals, setLocals] = useState([]);
  const [pois, setPois] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit/Add State
  const [modalType, setModalType] = useState(null); // 'local' | 'poi' | 'user' | null
  const [editItem, setEditItem] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const me = await getMe();
      setCurrentUser(me.user);
      
      if (me.user.role === 'admin') {
        const [l, p, u] = await Promise.all([listLocals(), listPOIs(), getUsers()]);
        setLocals(l);
        setPois(p);
        setUsers(u.users || []);
      } else {
        const [l, p] = await Promise.all([listLocals(), listPOIs()]);
        setLocals(l);
        setPois(p);
      }
    } catch (err) {
      console.error('ManagePanel load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin' && activeTab === 'users') {
      setActiveTab('locals');
    }
  }, [currentUser, activeTab]);

  const openAddLocal = () => {
    setModalType('local');
    setEditItem(null);
  };
  const openEditLocal = (item) => {
    setModalType('local');
    setEditItem(item);
  };
  const handleDeleteLocal = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce local ?')) return;
    try {
      await deleteLocal(id);
      loadData();
    } catch (err) {
      alert("Erreur lors de la suppression du local.");
    }
  };

  const openAddPOI = () => {
    setModalType('poi');
    setEditItem(null);
  };
  const openEditPOI = (item) => {
    setModalType('poi');
    setEditItem(item);
  };
  const handleDeletePOI = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce POI ?')) return;
    try {
      await deletePOI(id);
      loadData();
    } catch (err) {
      alert("Erreur lors de la suppression du POI.");
    }
  };

  const openAddUser = () => {
    setModalType('user');
    setEditItem(null);
  };
  const openEditUser = (item) => {
    setModalType('user');
    setEditItem(item);
  };
  const handleDeleteUser = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) return;
    try {
      await deleteUser(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || "Erreur lors de la suppression de l'utilisateur.");
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

  const getRoleBadge = (role) => {
    const badges = {
      admin: { bg: 'rgba(244, 63, 94, 0.15)', color: 'var(--danger)', border: 'rgba(244, 63, 94, 0.3)' },
      gestionnaire: { bg: 'rgba(251, 146, 60, 0.15)', color: 'var(--warning)', border: 'rgba(251, 146, 60, 0.3)' },
      client_simple: { bg: 'rgba(200, 200, 200, 0.15)', color: 'var(--text-muted)', border: 'rgba(200, 200, 200, 0.3)' },
      client_abonne: { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: 'rgba(16, 185, 129, 0.3)' }
    };
    return badges[role] || badges.client_simple;
  };

  const handleSaved = () => {
    loadData(); // reload list after add/edit
    // Also trigger global map refresh to see new points immediately
    window.dispatchEvent(new CustomEvent('djtsig-refresh-map'));
  };

  return (
    <div className="manage-panel">
      <div className="section-header">Gestion des données</div>

      {/* Tabs */}
      <div className="manage-tabs">
        <button
          className={`manage-tab ${activeTab === 'locals' ? 'active' : ''}`}
          onClick={() => setActiveTab('locals')}
        >
          🏢 Locaux
        </button>
        <button
          className={`manage-tab ${activeTab === 'pois' ? 'active' : ''}`}
          onClick={() => setActiveTab('pois')}
        >
          ⭐ POIs
        </button>
        {currentUser?.role === 'admin' && (
          <button
            className={`manage-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 Utilisateurs
          </button>
        )}
      </div>

      {/* Content */}
      <div className="manage-content">
        {loading ? (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <div>Chargement...</div>
          </div>
        ) : activeTab === 'locals' ? (
          <>
            <button className="manage-btn-add" onClick={openAddLocal}>
              + Ajouter un Local
            </button>
            <div className="manage-list">
              {locals.map(l => (
                <div key={l.id} className="manage-list-item">
                  <div className="manage-item-info">
                    <strong>{l.is_active ? '🔴 Concurrent' : '🟢 Disponible'} #{l.id}</strong>
                    <div className="manage-item-sub">
                      {l.surface_m2 ? `${l.surface_m2}m²` : '? m²'} • {l.address || 'Sans adresse'}
                    </div>
                  </div>
                  <div className="manage-item-actions">
                    <button className="btn-icon" onClick={() => openEditLocal(l)} title="Modifier">✏️</button>
                    <button className="btn-icon" onClick={() => handleDeleteLocal(l.id)} title="Supprimer">🗑️</button>
                  </div>
                </div>
              ))}
              {locals.length === 0 && <div className="manage-empty">Aucun local trouvé.</div>}
            </div>
          </>
        ) : activeTab === 'pois' ? (
          <>
            <button className="manage-btn-add" onClick={openAddPOI}>
              + Ajouter un POI
            </button>
            <div className="manage-list">
              {pois.map(p => (
                <div key={p.id} className="manage-list-item">
                  <div className="manage-item-info">
                    <strong>⭐ {p.name || `POI #${p.id}`}</strong>
                    <div className="manage-item-sub">Attractivité: {p.attractiveness}/10</div>
                  </div>
                  <div className="manage-item-actions">
                    <button className="btn-icon" onClick={() => openEditPOI(p)} title="Modifier">✏️</button>
                    <button className="btn-icon" onClick={() => handleDeletePOI(p.id)} title="Supprimer">🗑️</button>
                  </div>
                </div>
              ))}
              {pois.length === 0 && <div className="manage-empty">Aucun POI trouvé.</div>}
            </div>
          </>
        ) : (
          <>
            <button className="manage-btn-add" onClick={openAddUser}>
              + Ajouter un Utilisateur
            </button>
            <div className="manage-list">
              {users.map(u => {
                const badge = getRoleBadge(u.role);
                return (
                  <div key={u.id} className="manage-list-item">
                    <div className="manage-item-info">
                      <strong>{u.is_active ? '🟢' : '🔴'} {u.username}</strong>
                      <div className="manage-item-sub">
                        {u.email} • 
                        <span 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: badge.bg, 
                            color: badge.color, 
                            border: `1px solid ${badge.border}`,
                            marginLeft: '4px',
                            fontSize: '10px'
                          }}
                        >
                          {getRoleLabel(u.role)}
                        </span>
                      </div>
                    </div>
                    <div className="manage-item-actions">
                      <button className="btn-icon" onClick={() => openEditUser(u)} title="Modifier">✏️</button>
                      <button className="btn-icon" onClick={() => handleDeleteUser(u.id)} title="Supprimer">🗑️</button>
                    </div>
                  </div>
                );
              })}
              {users.length === 0 && <div className="manage-empty">Aucun utilisateur trouvé.</div>}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modalType === 'user' && (
        <UserEditModal
          initialData={editItem}
          onClose={() => setModalType(null)}
          onSaved={handleSaved}
        />
      )}
      {modalType && modalType !== 'user' && (
        <EditModal
          type={modalType}
          initialData={editItem}
          onClose={() => setModalType(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
