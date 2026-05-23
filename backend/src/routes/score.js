const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyJWT, requireRole } = require('../middleware/auth');

/**
 * Core scoring SQL — accepts a geometry expression string.
 * Returns a detailed score breakdown + final score (0–100).
 */
async function computeScore(geomExpr, params) {
  const sql = `
    WITH target AS (
      SELECT ${geomExpr} AS geom
    ),

    -- 1. Population within 1000m
    pop_score AS (
      SELECT COALESCE(SUM(p."Nombre_Habitants"), 0) AS total_pop
      FROM app_data."POPULATION" p, target t
      WHERE ST_DWithin(
        (SELECT ST_GeometryN(p."Geometrie_Point", 1) FROM app_data."POPULATION" p2 WHERE p2."ID_Population" = p."ID_Population"),
        t.geom, 1000
      )
    ),

    -- Simplified: use centroid of multipoint for distance calc
    pop_score2 AS (
      SELECT COALESCE(SUM(p."Nombre_Habitants"), 0) AS total_pop
      FROM app_data."POPULATION" p, target t
      WHERE ST_DWithin(ST_Centroid(p."Geometrie_Point"), t.geom, 1000)
    ),

    -- 2. Nearest road distance
    road_score AS (
      SELECT
        (SELECT ST_Distance(r."Geometrie_Ligne", t.geom) FROM app_data."RX_ROUTIER" r ORDER BY ST_Distance(r."Geometrie_Ligne", t.geom) ASC LIMIT 1) AS dist_to_road,
        (SELECT r2."Type_Route" FROM app_data."RX_ROUTIER" r2 ORDER BY ST_Distance(r2."Geometrie_Ligne", t.geom) ASC LIMIT 1) AS road_type
      FROM target t
    ),

    -- 3. Competitors within 500m (Est_Actif = true)
    competitor_score AS (
      SELECT COUNT(*) AS competitor_count
      FROM app_data."LOCAL" l, target t
      WHERE l."Est_Actif" = TRUE
        AND ST_DWithin(l."Geometrie_Point", t.geom, 500)
    ),

    -- 4. POIs within 500m
    poi_score AS (
      SELECT
        COUNT(*) AS poi_count,
        COALESCE(SUM(p."Note_Attractivite"), 0) AS poi_attractiveness
      FROM app_data."POINT_INTERET" p, target t
      WHERE ST_DWithin(p."Geometrie_Point", t.geom, 500)
    ),

    -- 5. Zone info
    zone_info AS (
      SELECT z."Nom_Zone", z."Code_Zone"
      FROM app_data."ZONE_GEOGRAPHIQUE" z, target t
      WHERE ST_Within(t.geom, z."Geometrie_Polygone")
      LIMIT 1
    )

    SELECT
      ps2.total_pop,
      rs.dist_to_road,
      rs.road_type,
      cs.competitor_count,
      pois.poi_count,
      pois.poi_attractiveness,
      zi."Nom_Zone",
      zi."Code_Zone",
      -- === SCORING FORMULA ===
      LEAST(100, GREATEST(0,
        -- Population component (max 40 pts): 40 pts at 10000+ residents
        LEAST(40, (ps2.total_pop::NUMERIC / 10000.0) * 40)
        -- Road Visibility (max 20 pts): full 20 if < 50m, scaled down to 500m
        + CASE
            WHEN rs.dist_to_road <= 50  THEN 20
            WHEN rs.dist_to_road <= 500 THEN 20 * (1 - (rs.dist_to_road - 50) / 450.0)
            ELSE 0
          END
        -- Competitor penalty (max -30 pts): -10 per competitor up to 3
        - LEAST(30, cs.competitor_count * 10)
        -- POI attractiveness (max 30 pts)
        + LEAST(30, pois.poi_count * 5 + (pois.poi_attractiveness::NUMERIC / 10.0) * 5)
      ))::NUMERIC(5,2) AS final_score
    FROM pop_score2 ps2, road_score rs, competitor_score cs, poi_score pois
    LEFT JOIN zone_info zi ON TRUE
  `;
  return db.query(sql, params);
}

/**
 * POST /api/score/coordinate
 * Body: { lon: number, lat: number }
 */
router.post('/coordinate', verifyJWT, requireRole(['admin', 'gestionnaire', 'client_abonne']), async (req, res) => {
  const { lon, lat } = req.body;

  if (!lon || !lat || isNaN(lon) || isNaN(lat)) {
    return res.status(400).json({ error: 'lon and lat (WGS84) are required numeric values.' });
  }

  // Clamp to approximate Algeria bounding box
  if (lat < 18 || lat > 38 || lon < -9 || lon > 12) {
    return res.status(400).json({ error: 'Coordinates appear to be outside Algeria.' });
  }

  try {
    // Transform WGS84 → UTM 32N (SRID 32632)
    const geomExpr = `ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 32632)`;
    const result = await computeScore(geomExpr, [lon, lat]);

    const row = result.rows[0];
    return res.json({
      coordinates: { lon, lat },
      score: {
        final_score: parseFloat(row.final_score),
        breakdown: {
          population_1km: parseInt(row.total_pop),
          dist_to_road_m: parseFloat(row.dist_to_road)?.toFixed(1),
          nearest_road_type: row.road_type,
          competitors_500m: parseInt(row.competitor_count),
          pois_500m: parseInt(row.poi_count),
          poi_attractiveness_sum: parseInt(row.poi_attractiveness),
          zone: row.nom_zone || 'Hors zone',
          zone_code: row.code_zone || null,
        },
      },
    });
  } catch (err) {
    console.error('Score coordinate error:', err);
    return res.status(500).json({ error: 'Internal server error during scoring.' });
  }
});

/**
 * GET /api/score/local/:id
 * Score an existing inactive LOCAL by its ID
 */
router.get('/local/:id', verifyJWT, requireRole(['admin', 'gestionnaire', 'client_abonne']), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid local ID.' });

  try {
    // First fetch the local info
    const localRes = await db.query(
      `SELECT "ID_Local", "Adresse_Complete", "Surface_m2", "Est_Actif",
              ST_X(ST_Transform("Geometrie_Point", 4326)) AS lon,
              ST_Y(ST_Transform("Geometrie_Point", 4326)) AS lat
       FROM app_data."LOCAL"
       WHERE "ID_Local" = $1`,
      [id]
    );

    if (localRes.rows.length === 0) {
      return res.status(404).json({ error: `Local with ID ${id} not found.` });
    }

    const local = localRes.rows[0];

    if (local.Est_Actif) {
      return res.status(400).json({
        error: 'This local is an existing active competitor and cannot be evaluated as a potential site.',
        local_id: id,
        is_competitor: true,
      });
    }

    // Score using the local's own geometry
    const geomExpr = `(SELECT "Geometrie_Point" FROM app_data."LOCAL" WHERE "ID_Local" = $1)`;
    const scoreResult = await computeScore(geomExpr, [id]);
    const row = scoreResult.rows[0];

    return res.json({
      local: {
        id: local.ID_Local,
        address: local.Adresse_Complete,
        surface_m2: parseFloat(local.Surface_m2),
        is_active: local.Est_Actif,
        coordinates: { lon: parseFloat(local.lon), lat: parseFloat(local.lat) },
      },
      score: {
        final_score: parseFloat(row.final_score),
        breakdown: {
          population_1km: parseInt(row.total_pop),
          dist_to_road_m: parseFloat(row.dist_to_road)?.toFixed(1),
          nearest_road_type: row.road_type,
          competitors_500m: parseInt(row.competitor_count),
          pois_500m: parseInt(row.poi_count),
          poi_attractiveness_sum: parseInt(row.poi_attractiveness),
          zone: row.nom_zone || 'Hors zone',
          zone_code: row.code_zone || null,
        },
      },
    });
  } catch (err) {
    console.error('Score local error:', err);
    return res.status(500).json({ error: 'Internal server error during local scoring.' });
  }
});

module.exports = router;
