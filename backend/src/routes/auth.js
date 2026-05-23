
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { verifyJWT, requireRole } = require('../middleware/auth');

const router = express.Router();

async function logAudit(action, entityType, entityId, oldValue, newValue, performedBy) {
  try {
    await query(
      `INSERT INTO app_data.audit_log (action, entity_type, entity_id, old_value, new_value, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, entityType, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, performedBy]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    const result = await query(
      'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.post('/register', verifyJWT, requireRole(['admin']), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    const validRoles = ['admin', 'gestionnaire', 'client_simple', 'client_abonne'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Nom d\'utilisateur ou email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, is_active',
      [username, email, passwordHash, role]
    );

    const newUser = result.rows[0];
    await logAudit('create', 'user', newUser.id, null, newUser, req.user.id);

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: newUser
    });
  } catch (error) {
    console.error('Erreur de création d\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.get('/users', verifyJWT, requireRole(['admin']), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Erreur de récupération des utilisateurs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.put('/users/:id', verifyJWT, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, is_active, password } = req.body;

    // Fetch existing user first for audit log
    const existingResult = await query(
      'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const currentUser = existingResult.rows[0];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (username) {
      updates.push(`username = $${paramIndex}`);
      values.push(username);
      paramIndex++;
    }
    if (email) {
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }
    if (role) {
      const validRoles = ['admin', 'gestionnaire', 'client_simple', 'client_abonne'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
      }
      updates.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }
    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIndex}`);
      values.push(passwordHash);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification à effectuer' });
    }

    values.push(id);
    const queryText = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, email, role, is_active`;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const updatedUser = result.rows[0];
    await logAudit('update', 'user', parseInt(id), currentUser, updatedUser, req.user.id);

    res.json({
      message: 'Utilisateur mis à jour avec succès',
      user: updatedUser
    });
  } catch (error) {
    console.error('Erreur de mise à jour de l\'utilisateur:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Nom d\'utilisateur ou email déjà utilisé' });
    }
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.delete('/users/:id', verifyJWT, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const existingResult = await query(
      'SELECT id, username, email, role, is_active FROM users WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    await logAudit('delete', 'user', parseInt(id), existingResult.rows[0], null, req.user.id);

    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error('Erreur de suppression de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

router.get('/me', verifyJWT, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
