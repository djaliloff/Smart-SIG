
-- Création de la table des utilisateurs

SET search_path TO app_data, public;

-- Créer la table users si elle n'existe pas
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'gestionnaire', 'client_simple', 'client_abonne')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créer une fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer un trigger pour mettre à jour updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Commenter la table
COMMENT ON TABLE users IS 'Table des utilisateurs du système DJT-SIG';
COMMENT ON COLUMN users.role IS 'Rôle de l''utilisateur: admin, gestionnaire, client_simple, client_abonne';
COMMENT ON COLUMN users.is_active IS 'Indique si le compte utilisateur est actif';


INSERT INTO app_data.users (username, email, password_hash, role) 
VALUES ('admin', 'admin@djt-sig.dz', '$2b$10$atkd6lIySlrin9VFnkYB9Or35cvPjAk0T26yollWQKTulpk9s8CqC', 'admin');

INSERT INTO app_data.users (username, email, password_hash, role) 
VALUES ('JOE', 'joe@sig.dz', '$2b$10$SnNNyGG.knfHS.z9vtPuUeFIee.8EjwZci5T6QKhRl9K7BzHmmwwq', 'admin');

