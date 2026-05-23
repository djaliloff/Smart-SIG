import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  getInactiveLocalsGeoJSON,
  getActiveLocalsGeoJSON,
  getPOIsGeoJSON,
  getZonesGeoJSON,
  getRoadsGeoJSON,
  getPopulationGeoJSON,
  getBuffersGeoJSON,
  getAccessibiliteGeoJSON,
  scoreCoordinate,
  scoreLocal,
} from '../api';

// Ali Mendjeli / Nouvelle Ville de Constantine, Algeria
const CONSTANTINE_CENTER = [6.625, 36.315];
const CONSTANTINE_ZOOM = 13;

// ── Add all custom layers ──────────────────────────────────────────────────────
function addAllLayers(map, colors) {
  const c = colors;

  // 1. Zones fill + outline + labels
  map.addLayer({
    id: 'zones-fill',
    type: 'fill',
    source: 'zones-src',
    paint: { 'fill-color': c.zones, 'fill-opacity': 0.06 },
  });
  map.addLayer({
    id: 'zones-outline',
    type: 'line',
    source: 'zones-src',
    paint: {
      'line-color': c.zones,
      'line-width': 1.5,
      'line-opacity': 0.55,
      'line-dasharray': [4, 2],
    },
  });
  map.addLayer({
    id: 'zones-label',
    type: 'symbol',
    source: 'zones-src',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-anchor': 'center',
    },
    paint: {
      'text-color': c.zones,
      'text-halo-color': 'rgba(5,10,26,0.85)',
      'text-halo-width': 2,
    },
  });

  // 2. Population bubbles
  map.addLayer({
    id: 'population-circles',
    type: 'circle',
    source: 'population-src',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'nombre_habitants'],
        0, 6, 1000, 10, 5000, 18, 10000, 28,
      ],
      'circle-color': c.population,
      'circle-opacity': 0.35,
      'circle-stroke-color': c.population,
      'circle-stroke-width': 1,
      'circle-stroke-opacity': 0.6,
    },
  });

  // 3. Roads
  map.addLayer({
    id: 'roads-lines',
    type: 'line',
    source: 'roads-src',
    paint: {
      'line-color': c.roads,
      'line-width': [
        'match', ['get', 'type_route'],
        'Principale', 2.5, 'Secondaire', 1.5, 'Type_T', 1.0, 1.2,
      ],
      'line-opacity': 0.75,
    },
  });

  // 4. Inactive locals (available sites)
  map.addLayer({
    id: 'locals-circles',
    type: 'circle',
    source: 'locals-src',
    paint: {
      'circle-radius': 7,
      'circle-color': c.locals,
      'circle-stroke-color': '#ecfdf5',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9,
    },
  });

  // 5. Active competitors
  map.addLayer({
    id: 'competitors-circles',
    type: 'circle',
    source: 'competitors-src',
    paint: {
      'circle-radius': 7,
      'circle-color': c.competitors,
      'circle-stroke-color': '#fef2f2',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9,
    },
  });

  // 6. POIs
  map.addLayer({
    id: 'pois-circles',
    type: 'circle',
    source: 'pois-src',
    paint: {
      'circle-radius': 6,
      'circle-color': c.pois,
      'circle-stroke-color': '#f5f3ff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.85,
    },
  });

  // 7. Buffers
  map.addLayer({
    id: 'buffers-fill',
    type: 'fill',
    source: 'buffers-src',
    paint: { 'fill-color': c.buffers, 'fill-opacity': 0.1 },
  });
  map.addLayer({
    id: 'buffers-outline',
    type: 'line',
    source: 'buffers-src',
    paint: {
      'line-color': c.buffers,
      'line-width': 2,
      'line-opacity': 0.6,
    },
  });

  // 8. Accessibilité
  map.addLayer({
    id: 'accessibilite-circles',
    type: 'circle',
    source: 'accessibilite-src',
    paint: {
      'circle-radius': 8,
      'circle-color': c.accessibilite,
      'circle-stroke-color': '#ccfbf1',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.8,
    },
  });
}

// ── Add empty sources ─────────────────────────────────────────────────────────
function addAllSources(map) {
  map.addSource('zones-src',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('roads-src',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('locals-src',      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('competitors-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('pois-src',        { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('population-src',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('buffers-src',     { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('accessibilite-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
}

// ── Load all GeoJSON data into the map sources ────────────────────────────────
async function loadAllData(map) {
  const [inactiveLocals, activeLocals, pois, zones, roads, population, buffers, accessibilite] = await Promise.all([
    getInactiveLocalsGeoJSON(),
    getActiveLocalsGeoJSON(),
    getPOIsGeoJSON(),
    getZonesGeoJSON(),
    getRoadsGeoJSON(),
    getPopulationGeoJSON(),
    getBuffersGeoJSON(),
    getAccessibiliteGeoJSON(),
  ]);
  map.getSource('zones-src').setData(zones);
  map.getSource('roads-src').setData(roads);
  map.getSource('locals-src').setData(inactiveLocals);
  map.getSource('competitors-src').setData(activeLocals);
  map.getSource('pois-src').setData(pois);
  map.getSource('population-src').setData(population);
  map.getSource('buffers-src').setData(buffers);
  map.getSource('accessibilite-src').setData(accessibilite);
}

// ── Apply colors to already-existing layers ───────────────────────────────────
function applyColors(map, colors) {
  const safe = (layerId) => map.getLayer(layerId);

  if (safe('zones-fill'))    map.setPaintProperty('zones-fill',    'fill-color',  colors.zones);
  if (safe('zones-outline')) map.setPaintProperty('zones-outline', 'line-color',  colors.zones);
  if (safe('zones-label'))   map.setPaintProperty('zones-label',   'text-color',  colors.zones);

  if (safe('roads-lines'))   map.setPaintProperty('roads-lines',   'line-color',  colors.roads);

  if (safe('locals-circles'))      map.setPaintProperty('locals-circles',      'circle-color', colors.locals);
  if (safe('competitors-circles')) map.setPaintProperty('competitors-circles', 'circle-color', colors.competitors);
  if (safe('pois-circles'))        map.setPaintProperty('pois-circles',        'circle-color', colors.pois);

  if (safe('population-circles')) {
    map.setPaintProperty('population-circles', 'circle-color',        colors.population);
    map.setPaintProperty('population-circles', 'circle-stroke-color', colors.population);
  }

  if (safe('buffers-fill'))    map.setPaintProperty('buffers-fill',    'fill-color', colors.buffers);
  if (safe('buffers-outline')) map.setPaintProperty('buffers-outline', 'line-color', colors.buffers);

  if (safe('accessibilite-circles')) map.setPaintProperty('accessibilite-circles', 'circle-color', colors.accessibilite);
}

export default function MapView({ visibleLayers, layerColors, onScoreResult, onLoading, mapStyle, disableScore }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const dataLoadedRef = useRef(false);
  const currentStyleRef = useRef(mapStyle);
  const layerColorsRef = useRef(layerColors);

  // Keep colors ref in sync for use inside async callbacks
  useEffect(() => { layerColorsRef.current = layerColors; }, [layerColors]);

  // ── Initialize Map ─────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle || 'https://tiles.openfreemap.org/styles/dark',
      center: CONSTANTINE_CENTER,
      zoom: CONSTANTINE_ZOOM,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', async () => {
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      addAllSources(map);
      addAllLayers(map, layerColorsRef.current);

      try {
        await loadAllData(map);
      } catch (err) {
        console.warn('Could not load one or more map layers:', err.message);
      }

      // ── Interactive popups ──────────────────────────────────
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 10 });

      let pickMode = false;
      window.addEventListener('djtsig-pickmode-start', () => { pickMode = true; map.getCanvas().style.cursor = 'crosshair'; });
      window.addEventListener('djtsig-pickmode-stop',  () => { pickMode = false; map.getCanvas().style.cursor = ''; });
      
      // Global map refresh (reloads GeoJSON data)
      window.addEventListener('djtsig-refresh-map', async () => {
        try { await loadAllData(map); } catch(e) {}
      });

      map.on('click', 'locals-circles', async (e) => {
        e.preventDefault();
        const feature = e.features[0];
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        if (pickMode) {
          window.dispatchEvent(new CustomEvent('djtsig-location-picked', { detail: { lon: coords[0], lat: coords[1] } }));
          placeClickMarker(map, coords, '#ffffff');
          return;
        }

        placeClickMarker(map, coords, layerColorsRef.current.locals);
        
        if (!disableScore && onScoreResult) {
          onLoading(true);
          try {
            const result = await scoreLocal(props.id);
            onScoreResult(result);
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 15), speed: 0.8 });
          } catch (err) {
            console.error('Local score error:', err);
          } finally {
            onLoading(false);
          }
        }
      });

      map.on('click', async (e) => {
        const { lng, lat } = e.lngLat;

        if (pickMode) {
          window.dispatchEvent(new CustomEvent('djtsig-location-picked', { detail: { lon: lng, lat: lat } }));
          placeClickMarker(map, [lng, lat], '#ffffff');
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['locals-circles', 'competitors-circles'],
        });
        if (features.length > 0) return;

        placeClickMarker(map, [lng, lat], '#3b82f6');
        
        if (!disableScore && onScoreResult) {
          onLoading(true);
          try {
            const result = await scoreCoordinate(lng, lat);
            onScoreResult(result);
          } catch (err) {
            console.error('Coordinate score error:', err);
            onScoreResult(null);
          } finally {
            onLoading(false);
          }
        }
      });

      const hoverLayers = {
        'locals-circles': (props) =>
          `<strong>🟢 Local Disponible</strong><br/>Surface : ${props.surface_m2 || '?'} m²${!disableScore ? '<br/><em style="color:#60a5fa;font-size:10px">Cliquez pour scorer</em>' : ''}`,
        'competitors-circles': (props) =>
          `<strong>🔴 Concurrent Actif</strong><br/>Surface : ${props.surface_m2 || '?'} m²`,
        'pois-circles': (props) =>
          `<strong>⭐ ${props.name}</strong><br/>Attractivité : ${props.attractiveness}/10`,
        'population-circles': (props) =>
          `<strong>👥 Population</strong><br/>${Number(props.nombre_habitants).toLocaleString('fr-DZ')} habitants`,
        'roads-lines': (props) =>
          `<strong>🛣️ ${props.type_route}</strong><br/>Vitesse max : ${props.vitesse_max || '?'} km/h`,
        'buffers-fill': (props) =>
          `<strong>📏 Buffer</strong><br/>Type : ${props.type_buffer || '?'}<br/>Seuil : ${props.valeur_seuil || '?'}`,
        'accessibilite-circles': (props) =>
          `<strong>🚗 Accessibilité</strong><br/>Temps : ${props.temps_trajet_min || '?'} min<br/>Mode : ${props.mode_transport || '?'}`,
      };

      Object.entries(hoverLayers).forEach(([layerId, buildHTML]) => {
        map.on('mouseenter', layerId, (e) => {
          map.getCanvas().style.cursor = layerId === 'competitors-circles' ? 'not-allowed' : (disableScore ? '' : 'pointer');
          const props = e.features[0].properties;
          const coords = e.features[0].geometry.type === 'Point'
            ? e.features[0].geometry.coordinates
            : e.lngLat.toArray();
          popup.setLngLat(coords).setHTML(buildHTML(props)).addTo(map);
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = 'crosshair';
          popup.remove();
        });
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      dataLoadedRef.current = false;
    };
  }, [disableScore, onScoreResult, onLoading]);

  // ── Map style (theme) hot-swap ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapStyle || currentStyleRef.current === mapStyle) return;
    currentStyleRef.current = mapStyle;
    dataLoadedRef.current = false;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    map.setStyle(mapStyle);

    map.once('style.load', async () => {
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      addAllSources(map);
      addAllLayers(map, layerColorsRef.current);
      map.jumpTo({ center, zoom, bearing, pitch });

      try {
        await loadAllData(map);
      } catch (err) {
        console.warn('Could not reload layers after style change:', err.message);
      }
    });
  }, [mapStyle]);

  // ── Layer color sync ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyColors(map, layerColors);
  }, [layerColors]);

  // ── Layer visibility sync ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const layerMap = {
      zones:       ['zones-fill', 'zones-outline', 'zones-label'],
      roads:       ['roads-lines'],
      locals:      ['locals-circles'],
      competitors: ['competitors-circles'],
      pois:        ['pois-circles'],
      population:  ['population-circles'],
      buffers:     ['buffers-fill', 'buffers-outline'],
      accessibilite: ['accessibilite-circles'],
    };

    Object.entries(layerMap).forEach(([key, layerIds]) => {
      layerIds.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibleLayers[key] ? 'visible' : 'none');
        }
      });
    });
  }, [visibleLayers]);

  // ── Fly-to event from Search panel ────────────────────────
  const flyToLocal = useCallback((lon, lat) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom: 16, speed: 1.2 });
    placeClickMarker(map, [lon, lat], layerColorsRef.current.locals);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const { lon, lat } = e.detail;
      flyToLocal(lon, lat);
    };
    window.addEventListener('djtsig-flyto', handler);
    return () => window.removeEventListener('djtsig-flyto', handler);
  }, [flyToLocal]);

  return (
    <div className="map-container" ref={mapContainerRef} />
  );
}

// ── Pulsing click marker ───────────────────────────────────
function placeClickMarker(map, lngLat, color) {
  if (window._clickMarker) window._clickMarker.remove();
  const el = document.createElement('div');
  el.style.cssText = `
    width: 14px; height: 14px;
    border-radius: 50%;
    background: ${color};
    border: 2px solid white;
    box-shadow: 0 0 0 4px ${color}55;
    animation: mapPulse 1.8s ease-out infinite;
  `;
  window._clickMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map);
}
