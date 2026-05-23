const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyJWT, requireRole } = require('../middleware/auth');

async function logAudit(action, entityType, entityId, oldValue, newValue, performedBy) {
  try {
    await db.query(
      `INSERT INTO app_data.audit_log (action, entity_type, entity_id, old_value, new_value, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, entityType, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, performedBy]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ═══════════════════════════════════════════════
//  LOCAL CRUD
// ═══════════════════════════════════════════════

/**
 * GET /api/manage/locals
 * List all locals (active + inactive) for management
 */
router.get('/locals', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l."ID_Local"          AS id,
        l."Adresse_Complete"  AS address,
        l."Surface_m2"        AS surface_m2,
        l."Est_Actif"         AS is_active,
        ST_X(ST_Transform(l."Geometrie_Point", 4326)) AS lon,
        ST_Y(ST_Transform(l."Geometrie_Point", 4326)) AS lat
      FROM app_data."LOCAL" l
      ORDER BY l."ID_Local"
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('List locals error:', err);
    return res.status(500).json({ error: 'Could not list locals.' });
  }
});

/**
 * POST /api/manage/locals
 * Create a new local.
 * Body: { lon, lat, address, surface_m2, is_active }
 * lon/lat must be WGS84 (4326). We transform to 32632 server-side.
 */
router.post('/locals', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const { lon, lat, address = '', surface_m2 = null, is_active = false } = req.body;

  if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) {
    return res.status(400).json({ error: 'lon and lat are required.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO app_data."LOCAL"
         ("Adresse_Complete", "Surface_m2", "Est_Actif", "Geometrie_Point")
       VALUES (
         $1, $2, $3,
         ST_Transform(ST_SetSRID(ST_MakePoint($4, $5), 4326), 32632)
       )
       RETURNING
         "ID_Local"          AS id,
         "Adresse_Complete"  AS address,
         "Surface_m2"        AS surface_m2,
         "Est_Actif"         AS is_active`,
      [address, surface_m2, is_active, lon, lat]
    );
    
    const newLocal = result.rows[0];
    await logAudit('create', 'local', newLocal.id, null, newLocal, req.user.id);
    
    return res.status(201).json({
      message: 'Local créé avec succès.',
      local: { ...newLocal, coordinates: { lon, lat } },
    });
  } catch (err) {
    console.error('Create local error:', err);
    return res.status(500).json({ error: 'Could not create local.' });
  }
});

/**
 * PUT /api/manage/locals/:id
 * Update an existing local.
 * Body: { lon?, lat?, address?, surface_m2?, is_active? }
 */
router.put('/locals/:id', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  const { lon, lat, address, surface_m2, is_active } = req.body;

  try {
    // Fetch existing first
    const existing = await db.query(
      `SELECT
         "ID_Local" AS id,
         "Adresse_Complete" AS address,
         "Surface_m2" AS surface_m2,
         "Est_Actif" AS is_active,
         ST_X(ST_Transform("Geometrie_Point", 4326)) AS lon,
         ST_Y(ST_Transform("Geometrie_Point", 4326)) AS lat
       FROM app_data."LOCAL"
       WHERE "ID_Local" = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: `Local #${id} not found.` });
    }

    const current = existing.rows[0];
    const newAddress    = address   !== undefined ? address   : current.address;
    const newSurface    = surface_m2 !== undefined ? surface_m2 : current.surface_m2;
    const newIsActive   = is_active  !== undefined ? is_active  : current.is_active;
    const newLon        = lon != null ? parseFloat(lon) : current.lon;
    const newLat        = lat != null ? parseFloat(lat) : current.lat;

    const result = await db.query(
      `UPDATE app_data."LOCAL"
       SET
         "Adresse_Complete" = $1,
         "Surface_m2"       = $2,
         "Est_Actif"        = $3,
         "Geometrie_Point"  = ST_Transform(ST_SetSRID(ST_MakePoint($4, $5), 4326), 32632)
       WHERE "ID_Local" = $6
       RETURNING
         "ID_Local"         AS id,
         "Adresse_Complete" AS address,
         "Surface_m2"       AS surface_m2,
         "Est_Actif"        AS is_active`,
      [newAddress, newSurface, newIsActive, newLon, newLat, id]
    );

    const updatedLocal = result.rows[0];
    await logAudit('update', 'local', id, current, updatedLocal, req.user.id);

    return res.json({
      message: 'Local mis à jour.',
      local: { ...updatedLocal, coordinates: { lon: newLon, lat: newLat } },
    });
  } catch (err) {
    console.error('Update local error:', err);
    return res.status(500).json({ error: 'Could not update local.' });
  }
});

/**
 * DELETE /api/manage/locals/:id
 */
router.delete('/locals/:id', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  try {
    const existing = await db.query(
      `SELECT "ID_Local" AS id FROM app_data."LOCAL" WHERE "ID_Local" = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: `Local #${id} not found.` });
    }

    const result = await db.query(
      `DELETE FROM app_data."LOCAL" WHERE "ID_Local" = $1 RETURNING "ID_Local"`,
      [id]
    );
    
    await logAudit('delete', 'local', id, existing.rows[0], null, req.user.id);
    
    return res.json({ message: `Local #${id} supprimé.` });
  } catch (err) {
    console.error('Delete local error:', err);
    return res.status(500).json({ error: 'Could not delete local.' });
  }
});

// ═══════════════════════════════════════════════
//  POINT_INTERET CRUD
// ═══════════════════════════════════════════════

/**
 * GET /api/manage/pois
 * List all POIs for management
 */
router.get('/pois', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p."ID_POI"           AS id,
        p."Nom_POI"          AS name,
        p."Note_Attractivite" AS attractiveness,
        ST_X(ST_Transform(p."Geometrie_Point", 4326)) AS lon,
        ST_Y(ST_Transform(p."Geometrie_Point", 4326)) AS lat
      FROM app_data."POINT_INTERET" p
      ORDER BY p."ID_POI"
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('List POIs error:', err);
    return res.status(500).json({ error: 'Could not list POIs.' });
  }
});

/**
 * POST /api/manage/pois
 * Create a new POI.
 * Body: { lon, lat, name, attractiveness }
 */
router.post('/pois', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const { lon, lat, name = '', attractiveness = 5 } = req.body;

  if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) {
    return res.status(400).json({ error: 'lon and lat are required.' });
  }

  const attr = Math.min(10, Math.max(1, parseInt(attractiveness) || 5));

  try {
    const result = await db.query(
      `INSERT INTO app_data."POINT_INTERET"
         ("Nom_POI", "Note_Attractivite", "Geometrie_Point")
       VALUES (
         $1, $2,
         ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 32632)
       )
       RETURNING
         "ID_POI"           AS id,
         "Nom_POI"          AS name,
         "Note_Attractivite" AS attractiveness`,
      [name, attr, lon, lat]
    );

    const newPOI = result.rows[0];
    await logAudit('create', 'poi', newPOI.id, null, newPOI, req.user.id);

    return res.status(201).json({
      message: 'Point d\'intérêt créé avec succès.',
      poi: { ...newPOI, coordinates: { lon, lat } },
    });
  } catch (err) {
    console.error('Create POI error:', err);
    return res.status(500).json({ error: 'Could not create POI.' });
  }
});

/**
 * PUT /api/manage/pois/:id
 * Update an existing POI.
 * Body: { lon?, lat?, name?, attractiveness? }
 */
router.put('/pois/:id', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  const { lon, lat, name, attractiveness } = req.body;

  try {
    const existing = await db.query(
      `SELECT
         "ID_POI" AS id,
         "Nom_POI" AS name,
         "Note_Attractivite" AS attractiveness,
         ST_X(ST_Transform("Geometrie_Point", 4326)) AS lon,
         ST_Y(ST_Transform("Geometrie_Point", 4326)) AS lat
       FROM app_data."POINT_INTERET"
       WHERE "ID_POI" = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: `POI #${id} not found.` });
    }

    const current = existing.rows[0];
    const newName  = name !== undefined ? name : current.name;
    const newAttr  = attractiveness !== undefined
      ? Math.min(10, Math.max(1, parseInt(attractiveness) || 5))
      : current.attractiveness;
    const newLon   = lon != null ? parseFloat(lon) : current.lon;
    const newLat   = lat != null ? parseFloat(lat) : current.lat;

    const result = await db.query(
      `UPDATE app_data."POINT_INTERET"
       SET
         "Nom_POI"           = $1,
         "Note_Attractivite" = $2,
         "Geometrie_Point"   = ST_Transform(ST_SetSRID(ST_MakePoint($3, $4), 4326), 32632)
       WHERE "ID_POI" = $5
       RETURNING
         "ID_POI"            AS id,
         "Nom_POI"           AS name,
         "Note_Attractivite" AS attractiveness`,
      [newName, newAttr, newLon, newLat, id]
    );

    const updatedPOI = result.rows[0];
    await logAudit('update', 'poi', id, current, updatedPOI, req.user.id);

    return res.json({
      message: 'POI mis à jour.',
      poi: { ...updatedPOI, coordinates: { lon: newLon, lat: newLat } },
    });
  } catch (err) {
    console.error('Update POI error:', err);
    return res.status(500).json({ error: 'Could not update POI.' });
  }
});

/**
 * DELETE /api/manage/pois/:id
 */
router.delete('/pois/:id', verifyJWT, requireRole(['admin', 'gestionnaire']), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  try {
    const existing = await db.query(
      `SELECT "ID_POI" AS id FROM app_data."POINT_INTERET" WHERE "ID_POI" = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: `POI #${id} not found.` });
    }

    const result = await db.query(
      `DELETE FROM app_data."POINT_INTERET" WHERE "ID_POI" = $1 RETURNING "ID_POI"`,
      [id]
    );

    await logAudit('delete', 'poi', id, existing.rows[0], null, req.user.id);

    return res.json({ message: `POI #${id} supprimé.` });
  } catch (err) {
    console.error('Delete POI error:', err);
    return res.status(500).json({ error: 'Could not delete POI.' });
  }
});

module.exports = router;
