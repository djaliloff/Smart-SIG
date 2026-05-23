const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyJWT, requireRole } = require('../middleware/auth');

/**
 * GET /api/search
 * Query params:
 *   q          - text search in Adresse_Complete
 *   zone       - filter by Nom_Zone (partial match)
 *   min_surface - minimum Surface_m2
 *   max_surface - maximum Surface_m2
 *   min_score  - minimum Location Score (0–100), triggers scoring sub-query
 *   limit      - max results (default 50)
 *   offset     - pagination offset (default 0)
 */
router.get('/', verifyJWT, requireRole(['admin', 'gestionnaire', 'client_abonne']), async (req, res) => {
  const {
    q = '',
    zone = '',
    min_surface,
    max_surface,
    min_score,
    limit = 50,
    offset = 0,
  } = req.query;

  try {
    const filters = [];
    const params = [];

    filters.push(`l."Est_Actif" = TRUE`);

    if (q.trim()) {
      params.push(`%${q.trim()}%`);
      filters.push(`l."Adresse_Complete" ILIKE $${params.length}`);
    }

    if (zone.trim()) {
      params.push(`%${zone.trim()}%`);
      filters.push(`EXISTS (
        SELECT 1 FROM app_data."ZONE_GEOGRAPHIQUE" z
        WHERE z."Nom_Zone" ILIKE $${params.length}
          AND ST_Within(l."Geometrie_Point", z."Geometrie_Polygone")
      )`);
    }

    if (min_surface !== undefined && !isNaN(min_surface)) {
      params.push(parseFloat(min_surface));
      filters.push(`l."Surface_m2" >= $${params.length}`);
    }

    if (max_surface !== undefined && !isNaN(max_surface)) {
      params.push(parseFloat(max_surface));
      filters.push(`l."Surface_m2" <= $${params.length}`);
    }

    const whereClause = filters.join(' AND ');
    const scoreSubquery = `
      LEAST(100, GREATEST(0,
        LEAST(40, (
          SELECT COALESCE(SUM(p."Nombre_Habitants"), 0)::NUMERIC
          FROM app_data."POPULATION" p
          WHERE ST_DWithin(ST_Centroid(p."Geometrie_Point"), l."Geometrie_Point", 1000)
        ) / 10000.0 * 40)
        + CASE
            WHEN (SELECT MIN(ST_Distance(r."Geometrie_Ligne", l."Geometrie_Point")) FROM app_data."RX_ROUTIER" r) <= 50
              THEN 20
            WHEN (SELECT MIN(ST_Distance(r2."Geometrie_Ligne", l."Geometrie_Point")) FROM app_data."RX_ROUTIER" r2) <= 500
              THEN 20 * (1 - ((SELECT MIN(ST_Distance(r2."Geometrie_Ligne", l."Geometrie_Point")) FROM app_data."RX_ROUTIER" r2) - 50) / 450.0)
            ELSE 0
          END
        - LEAST(30, (
          SELECT COUNT(*)::NUMERIC * 10
          FROM app_data."LOCAL" c
          WHERE c."Est_Actif" = TRUE AND ST_DWithin(c."Geometrie_Point", l."Geometrie_Point", 500)
        ))
        + LEAST(30, (
          SELECT COUNT(*)::NUMERIC * 5 + COALESCE(SUM("Note_Attractivite"), 0)::NUMERIC / 10.0 * 5
          FROM app_data."POINT_INTERET" poi
          WHERE ST_DWithin(poi."Geometrie_Point", l."Geometrie_Point", 500)
        ))
      ))::NUMERIC(5,2)
    `;

    let havingClause = '';
    let groupByClause = '';
    if (min_score !== undefined && !isNaN(min_score)) {
      params.push(parseFloat(min_score));
      havingClause = `HAVING ${scoreSubquery} >= $${params.length}`;
      groupByClause = `GROUP BY l."ID_Local"`;
    }

    const mainParams = [...params];
    mainParams.push(parseInt(limit) || 50);
    mainParams.push(parseInt(offset) || 0);

    const sql = `
      SELECT
        l."ID_Local",
        l."Adresse_Complete",
        l."Surface_m2",
        l."Est_Actif",
        ST_X(ST_Transform(l."Geometrie_Point", 4326)) AS lon,
        ST_Y(ST_Transform(l."Geometrie_Point", 4326)) AS lat,
        (SELECT z."Nom_Zone" FROM app_data."ZONE_GEOGRAPHIQUE" z
         WHERE ST_Within(l."Geometrie_Point", z."Geometrie_Polygone") LIMIT 1) AS zone_name,
        ${scoreSubquery} AS location_score
      FROM app_data."LOCAL" l
      WHERE ${whereClause}
      ${groupByClause}
      ${havingClause}
      ORDER BY location_score DESC NULLS LAST
      LIMIT $${mainParams.length - 1} OFFSET $${mainParams.length}
    `;

    const result = await db.query(sql, mainParams);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT l."ID_Local"
        FROM app_data."LOCAL" l
        WHERE ${whereClause}
        ${groupByClause}
        ${havingClause}
      ) AS subq
    `;
    const countResult = await db.query(countSql, params);

    return res.json({
      total: parseInt(countResult.rows[0]?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset),
      results: result.rows.map(r => ({
        id: r.ID_Local,
        address: r.Adresse_Complete,
        surface_m2: parseFloat(r.Surface_m2) || null,
        is_active: r.Est_Actif,
        coordinates: { lon: parseFloat(r.lon), lat: parseFloat(r.lat) },
        zone_name: r.zone_name || 'Hors zone',
        location_score: parseFloat(r.location_score) || 0,
      })),
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Internal server error during search.' });
  }
});

/**
 * GET /api/search/zones
 * Returns all zone names for filter dropdown
 */
router.get('/zones', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT "Code_Zone", "Nom_Zone" FROM app_data."ZONE_GEOGRAPHIQUE" ORDER BY "Nom_Zone"`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Zones fetch error:', err);
    return res.status(500).json({ error: 'Could not fetch zones.' });
  }
});

/**
 * GET /api/search/locals/inactive
 * Returns all inactive locals as GeoJSON for map layer
 */
router.get('/locals/inactive', verifyJWT, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l."ID_Local" AS id,
        l."Adresse_Complete" AS address,
        l."Surface_m2" AS surface_m2,
        ST_AsGeoJSON(ST_Transform(l."Geometrie_Point", 4326))::json AS geometry
      FROM app_data."LOCAL" l
      WHERE l."Est_Actif" = FALSE
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          address: r.address,
          surface_m2: parseFloat(r.surface_m2) || 0,
          is_active: false,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Locals inactive error:', err);
    return res.status(500).json({ error: 'Could not fetch inactive locals.' });
  }
});

/**
 * GET /api/search/locals/active
 * Returns all active competitors as GeoJSON for map layer
 */
router.get('/locals/active', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l."ID_Local" AS id,
        l."Adresse_Complete" AS address,
        l."Surface_m2" AS surface_m2,
        ST_AsGeoJSON(ST_Transform(l."Geometrie_Point", 4326))::json AS geometry
      FROM app_data."LOCAL" l
      WHERE l."Est_Actif" = TRUE
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          address: r.address,
          surface_m2: parseFloat(r.surface_m2) || 0,
          is_active: true,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Locals active error:', err);
    return res.status(500).json({ error: 'Could not fetch active locals.' });
  }
});

/**
 * GET /api/search/pois
 * Returns all POIs as GeoJSON
 */
router.get('/pois', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        "ID_POI" AS id,
        "Nom_POI" AS name,
        "Note_Attractivite" AS attractiveness,
        ST_AsGeoJSON(ST_Transform("Geometrie_Point", 4326))::json AS geometry
      FROM app_data."POINT_INTERET"
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          name: r.name,
          attractiveness: r.attractiveness,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('POIs fetch error:', err);
    return res.status(500).json({ error: 'Could not fetch POIs.' });
  }
});

/**
 * GET /api/search/zones/geojson
 * Returns all zones as GeoJSON for map overlay
 */
router.get('/zones/geojson', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        "Code_Zone" AS code,
        "Nom_Zone" AS name,
        ST_AsGeoJSON(ST_Transform("Geometrie_Polygone", 4326))::json AS geometry
      FROM app_data."ZONE_GEOGRAPHIQUE"
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: { code: r.code, name: r.name },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Zones GeoJSON error:', err);
    return res.status(500).json({ error: 'Could not fetch zones GeoJSON.' });
  }
});

/**
 * GET /api/search/roads
 * Returns all roads as GeoJSON (MultiLineString → FeatureCollection)
 */
router.get('/roads', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        r."ID_Route" AS id,
        r."Type_Route" AS type_route,
        r."Vitesse_Max" AS vitesse_max,
        ST_AsGeoJSON(ST_Transform(r."Geometrie_Ligne", 4326))::json AS geometry
      FROM app_data."RX_ROUTIER" r
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          type_route: r.type_route,
          vitesse_max: r.vitesse_max,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Roads GeoJSON error:', err);
    return res.status(500).json({ error: 'Could not fetch roads GeoJSON.' });
  }
});

/**
 * GET /api/search/population
 * Returns population clusters as GeoJSON points (centroid of MultiPoint)
 */
router.get('/population', verifyJWT, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p."ID_Population" AS id,
        p."Nombre_Habitants" AS nombre_habitants,
        p."Revenu_Moyen" AS revenu_moyen,
        ST_AsGeoJSON(ST_Transform(ST_Centroid(p."Geometrie_Point"), 4326))::json AS geometry
      FROM app_data."POPULATION" p
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          nombre_habitants: r.nombre_habitants,
          revenu_moyen: r.revenu_moyen !== null ? parseFloat(r.revenu_moyen) : null,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Population GeoJSON error:', err);
    return res.status(500).json({ error: 'Could not fetch population GeoJSON.' });
  }
});

/**
 * GET /api/search/buffers
 * Returns all buffers as GeoJSON
 */
router.get('/buffers', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        b."ID_Buffer" AS id,
        b."Type_Buffer" AS type_buffer,
        b."Valeur_Seuil" AS valeur_seuil,
        b."ID_Local" AS id_local,
        ST_AsGeoJSON(ST_Transform(b."Geometrie_Polygone", 4326))::json AS geometry
      FROM app_data."BUFFER" b
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          type_buffer: r.type_buffer,
          valeur_seuil: r.valeur_seuil !== null ? parseFloat(r.valeur_seuil) : null,
          id_local: r.id_local,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Buffers GeoJSON error:', err);
    return res.status(500).json({ error: 'Could not fetch buffers GeoJSON.' });
  }
});

/**
 * GET /api/search/accessibilite
 * Returns accessibility data as GeoJSON
 */
router.get('/accessibilite', verifyJWT, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        a."ID_Accessibilite" AS id,
        a."Temps_Trajet_Min" AS temps_trajet_min,
        a."Distance_Reseau_m" AS distance_reseau_m,
        a."Mode_Transport" AS mode_transport,
        a."ID_Local" AS id_local,
        a."ID_Population" AS id_population,
        ST_AsGeoJSON(ST_Transform(p."Geometrie_Point", 4326))::json AS geometry
      FROM app_data."ACCESSIBILITE" a
      LEFT JOIN app_data."POPULATION" p ON a."ID_Population" = p."ID_Population"
      WHERE p."Geometrie_Point" IS NOT NULL
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          temps_trajet_min: r.temps_trajet_min !== null ? parseFloat(r.temps_trajet_min) : null,
          distance_reseau_m: r.distance_reseau_m !== null ? parseFloat(r.distance_reseau_m) : null,
          mode_transport: r.mode_transport,
          id_local: r.id_local,
          id_population: r.id_population,
        },
      })),
    };

    return res.json(geojson);
  } catch (err) {
    console.error('Accessibilite GeoJSON error:', err);
    return res.status(500).json({ error: 'Could not fetch accessibilite GeoJSON.' });
  }
});

module.exports = router;
