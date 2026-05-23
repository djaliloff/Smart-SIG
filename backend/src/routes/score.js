const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyJWT, requireRole } = require('../middleware/auth');

/**
 * Core scoring SQL — accepts a geometry expression string.
 *
 * SCORING BREAKDOWN (total: 0–100 pts)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Population density 1 km      →  0–25 pts   (POPULATION)
 *  2. Road visibility               →  0–20 pts   (RX_ROUTIER)
 *  3. POI attractiveness            →  0–25 pts   (POINT_INTERET)
 *  4. Pedestrian accessibility      →  0–15 pts   (ACCESSIBILITE + POPULATION)
 *  5. Competitive opportunity       →  0–15 pts   (LOCAL + BUFFER)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Grand total                      →  0–100 pts  (exact maximum = 100)
 *
 * All geometries are stored in SRID 32632 (UTM 32N, metres).
 */
async function computeScore(geomExpr, params) {
  const sql = `
    WITH target AS (
      SELECT ${geomExpr} AS geom
    ),

    -- ── 1. Population within 1 000 m ────────────────────────────────────────
    pop_score AS (
      SELECT COALESCE(SUM(p."Nombre_Habitants"), 0) AS total_pop
      FROM app_data."POPULATION" p, target t
      WHERE ST_DWithin(p."Geometrie_Point", t.geom, 1000)
    ),

    -- ── 2. Nearest road: distance + type from the SAME row (LATERAL) ────────
    road_score AS (
      SELECT
        COALESCE(nr.dist_to_road, 99999) AS dist_to_road,
        nr.road_type
      FROM target t
      LEFT JOIN LATERAL (
        SELECT
          ST_Distance(r."Geometrie_Ligne", t.geom) AS dist_to_road,
          r."Type_Route"                            AS road_type
        FROM app_data."RX_ROUTIER" r
        ORDER BY ST_Distance(r."Geometrie_Ligne", t.geom) ASC
        LIMIT 1
      ) nr ON TRUE
    ),

    -- ── 3. Active competitors within 500 m ───────────────────────────────────
    competitor_score AS (
      SELECT COUNT(*) AS competitor_count
      FROM app_data."LOCAL" l, target t
      WHERE l."Est_Actif" = TRUE
        AND ST_DWithin(l."Geometrie_Point", t.geom, 500)
    ),

    -- ── 4. POIs within 500 m ─────────────────────────────────────────────────
    --   Note_Attractivite was not populated during ETL migration.
    --   COALESCE(..., 5) assigns a base attractiveness of 5 per POI so the
    --   component produces meaningful output even on un-rated POIs.
    poi_score AS (
      SELECT
        COUNT(*)                                                AS poi_count,
        COALESCE(SUM(COALESCE(p."Note_Attractivite", 5)), 0)   AS poi_attractiveness
      FROM app_data."POINT_INTERET" p, target t
      WHERE ST_DWithin(p."Geometrie_Point", t.geom, 500)
    ),

    -- ── 5. Pedestrian accessibility ──────────────────────────────────────────
    --   The ACCESSIBILITE migration did not populate ID_Population / ID_Local,
    --   so a relational JOIN never returns rows.
    --   Instead we estimate walking time from straight-line distance to each
    --   population cluster within 1 000 m of the target:
    --     5 km/h walking speed  →  83.33 m/min
    --     time_min = ST_Distance(metres) / 83.33
    --   Falls back to 15 min when no population clusters are found nearby.
    accessibility_score AS (
      SELECT COALESCE(
        AVG(ST_Distance(p."Geometrie_Point", t.geom) / 83.33),
        15
      ) AS avg_travel_min
      FROM app_data."POPULATION" p, target t
      WHERE ST_DWithin(p."Geometrie_Point", t.geom, 1000)
    ),

    -- ── 6. Buffer overlap count (NEW) ────────────────────────────────────────
    --   How many competitor-influence buffer polygons contain the target point.
    --   Each overlap signals the target is inside an established competitor zone.
    buffer_score AS (
      SELECT COUNT(*) AS buffer_overlap_count
      FROM app_data."BUFFER" b, target t
      WHERE ST_Within(t.geom, b."Geometrie_Polygone")
    ),

    -- ── 7. Zone the target falls within (first match) ────────────────────────
    zone_info AS (
      SELECT
        z."Nom_Zone"  AS nom_zone,
        z."Code_Zone" AS code_zone
      FROM app_data."ZONE_GEOGRAPHIQUE" z, target t
      WHERE ST_Within(t.geom, z."Geometrie_Polygone")
      LIMIT 1
    )

    SELECT
      -- Raw metrics
      ps.total_pop,
      rs.dist_to_road,
      rs.road_type,
      cs.competitor_count,
      pois.poi_count,
      pois.poi_attractiveness,
      accs.avg_travel_min,
      bs.buffer_overlap_count,
      zi.nom_zone,
      zi.code_zone,

      -- ════════════════════════════════════════════════════════════════════════
      -- SCORING FORMULA  — theoretical max = 25 + 20 + 25 + 15 + 15 = 100 pts
      -- ════════════════════════════════════════════════════════════════════════
      LEAST(100, GREATEST(0,

        -- ① Population density (0–25 pts)
        --   Full 25 pts at 10 000+ residents within 1 km
        LEAST(25, (ps.total_pop::NUMERIC / 10000.0) * 25)

        -- ② Road visibility (0–20 pts)
        --   Full 20 pts if ≤ 50 m; linear decay to 0 at 500 m
        + CASE
            WHEN rs.dist_to_road <= 50  THEN 20
            WHEN rs.dist_to_road <= 500 THEN 20 * (1 - (rs.dist_to_road - 50) / 450.0)
            ELSE 0
          END

        -- ③ POI attractiveness (0–25 pts)
        --   Combines nearby POI count (3 pts each) and their attractiveness sum
        + LEAST(25,
            pois.poi_count::NUMERIC * 3
            + (pois.poi_attractiveness::NUMERIC / 10.0) * 4
          )

        -- ④ Pedestrian accessibility (0–15 pts)
        --   15 pts at avg ≤ 5 min walking time; linear decay to 0 at 30 min
        + GREATEST(0,
            LEAST(15,
              15.0 * (1.0 - (accs.avg_travel_min - 5.0) / 25.0)
            )
          )

        -- ⑤ Competitive opportunity (0–15 pts)
        --   Starts at 15; −4 pts per direct competitor (500 m radius);
        --   −2 pts per buffer zone the point falls inside (competitor influence)
        + GREATEST(0,
            15
            - (cs.competitor_count::NUMERIC    * 4)
            - (bs.buffer_overlap_count::NUMERIC * 2)
          )

      ))::NUMERIC(5,2) AS final_score

    FROM pop_score ps,
         road_score rs,
         competitor_score cs,
         poi_score pois,
         accessibility_score accs,
         buffer_score bs
    LEFT JOIN zone_info zi ON TRUE
  `;
  return db.query(sql, params);
}

// ─── Helper: safely parse a nullable numeric value ───────────────────────────
function safeFloat(val, decimals) {
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return decimals !== undefined ? parseFloat(n.toFixed(decimals)) : n;
}

// ─── Helper: build the score breakdown object from a DB result row ────────────
function buildBreakdown(row) {
  return {
    // Component ①
    population_1km:          parseInt(row.total_pop)              || 0,
    // Component ②
    dist_to_road_m:          safeFloat(row.dist_to_road, 1),
    nearest_road_type:       row.road_type                        || null,
    // Component ③
    pois_500m:               parseInt(row.poi_count)              || 0,
    poi_attractiveness_sum:  parseInt(row.poi_attractiveness)     || 0,
    // Component ④  (NEW)
    avg_travel_min:          safeFloat(row.avg_travel_min, 1),
    // Component ⑤  (NEW/UPDATED)
    competitors_500m:        parseInt(row.competitor_count)       || 0,
    buffer_overlaps:         parseInt(row.buffer_overlap_count)   || 0,
    // Location
    zone:                    row.nom_zone                         || 'Hors zone',
    zone_code:               row.code_zone                        || null,
  };
}

/**
 * POST /api/score/coordinate
 * Body: { lon: number, lat: number }
 */
router.post(
  '/coordinate',
  verifyJWT,
  requireRole(['admin', 'gestionnaire', 'client_abonne']),
  async (req, res) => {
    const { lon, lat } = req.body;

    if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) {
      return res.status(400).json({ error: 'lon and lat (WGS84) are required numeric values.' });
    }
    if (lat < 18 || lat > 38 || lon < -9 || lon > 12) {
      return res.status(400).json({ error: 'Coordinates appear to be outside Algeria.' });
    }

    try {
      const geomExpr = `ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 32632)`;
      const result   = await computeScore(geomExpr, [lon, lat]);
      const row      = result.rows[0];

      return res.json({
        coordinates: { lon, lat },
        score: {
          final_score: safeFloat(row.final_score),
          breakdown:   buildBreakdown(row),
        },
      });
    } catch (err) {
      console.error('Score coordinate error:', err);
      return res.status(500).json({ error: 'Internal server error during scoring.' });
    }
  }
);

/**
 * GET /api/score/local/:id
 * Score an existing INACTIVE local by its ID.
 */
router.get(
  '/local/:id',
  verifyJWT,
  requireRole(['admin', 'gestionnaire', 'client_abonne']),
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid local ID.' });

    try {
      const localRes = await db.query(
        `SELECT
           "ID_Local"         AS id_local,
           "Adresse_Complete" AS adresse_complete,
           "Surface_m2"       AS surface_m2,
           "Est_Actif"        AS est_actif,
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

      if (local.est_actif === true) {
        return res.status(400).json({
          error: 'This local is an existing active competitor and cannot be evaluated as a potential site.',
          local_id: id,
          is_competitor: true,
        });
      }

      const geomExpr    = `(SELECT "Geometrie_Point" FROM app_data."LOCAL" WHERE "ID_Local" = $1)`;
      const scoreResult = await computeScore(geomExpr, [id]);
      const row         = scoreResult.rows[0];

      return res.json({
        local: {
          id:          local.id_local,
          address:     local.adresse_complete,
          surface_m2:  safeFloat(local.surface_m2),
          is_active:   local.est_actif,
          coordinates: { lon: safeFloat(local.lon), lat: safeFloat(local.lat) },
        },
        score: {
          final_score: safeFloat(row.final_score),
          breakdown:   buildBreakdown(row),
        },
      });
    } catch (err) {
      console.error('Score local error:', err);
      return res.status(500).json({ error: 'Internal server error during local scoring.' });
    }
  }
);

module.exports = router;