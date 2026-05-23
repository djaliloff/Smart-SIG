
-- Création de la table des logs d'audit
SET search_path TO app_data, public;

-- Créer la table audit_log si elle n'existe pas
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  performed_by INTEGER NOT NULL REFERENCES users(id),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Commenter la table
COMMENT ON TABLE audit_log IS 'Table des logs d''audit pour suivre les modifications des utilisateurs et des données';
COMMENT ON COLUMN audit_log.action IS 'Action effectuée: create, update, delete';
COMMENT ON COLUMN audit_log.entity_type IS 'Type d''entité modifiée: user, local, poi, etc.';
