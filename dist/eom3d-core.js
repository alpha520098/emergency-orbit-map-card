/* Emergency Orbit 3D Card core v0.1.0-alpha.1 */
(() => {
  'use strict';
  const TAG = 'emergency-orbit-3d-card';
  const VERSION = '0.1.0-alpha.1';
  const MAPLIBRE_VERSION = '5.24.0';
  const MAPLIBRE_SCRIPT = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
  const MAPLIBRE_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

  const EMPTY_FC = Object.freeze({ type: 'FeatureCollection', features: [] });
  const LEVELS = Object.freeze({
    none: { rank: 0, colour: '#4b8cff', label: 'INFORMATION', short: 'INFO' },
    minor: { rank: 1, colour: '#4b8cff', label: 'INFORMATION', short: 'INFO' },
    moderate: { rank: 2, colour: '#ffd83d', label: 'ADVICE', short: 'ADVICE' },
    severe: { rank: 3, colour: '#ff812d', label: 'WATCH AND ACT', short: 'WATCH' },
    extreme: { rank: 4, colour: '#ff3b44', label: 'EMERGENCY WARNING', short: 'WARNING' },
  });

  const DEFAULTS = Object.freeze({
    title: 'Emergency Orbit 3D',
    subtitle: 'LIVE REGIONAL EMERGENCY PICTURE',
    demo_mode: false,
    debug: false,
    entities: {
      incidents: 'sensor.abc_emergency_home_nearby_incidents',
      nearest: 'sensor.abc_emergency_home_nearest_incident',
      active: 'binary_sensor.abc_emergency_home_active_alert',
      inside_polygon: 'binary_sensor.abc_emergency_home_inside_polygon',
      highest_level: 'sensor.abc_emergency_home_highest_alert_level',
    },
    region: {
      mode: 'home',
      label: 'Macarthur operational region',
      radius_km: 40,
    },
    home: {},
    map: {
      height: 620,
      style_url: 'https://tiles.openfreemap.org/styles/dark',
      terrain: true,
      terrain_url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      terrain_exaggeration: 1.35,
      overview_pitch: 50,
      overview_bearing: -18,
      incident_pitch: 62,
      incident_zoom: 14.2,
      max_incident_zoom: 15.8,
      min_zoom: 4,
      max_zoom: 18,
      show_3d_buildings: true,
      maplibre_script_url: MAPLIBRE_SCRIPT,
      maplibre_css_url: MAPLIBRE_CSS,
    },
    camera: {
      orbit: true,
      orbit_duration: 22000,
      orbit_turns: 1,
      fly_duration: 3600,
      auto_return: true,
      auto_return_delay: 4500,
      focus_on_load: true,
      refocus_on_escalation: true,
    },
    display: {
      show_controls: true,
      show_region: true,
      show_home: true,
      show_incident_panel: true,
      show_clear_state: true,
      show_camera_readout: true,
      hide_non_urgent: true,
      panel_open: true,
    },
  });

  let mapLibrePromise = null;

  const merge = (base, update) => {
    const output = { ...base };
    for (const [key, value] of Object.entries(update || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
        output[key] = merge(base[key], value);
      } else {
        output[key] = value;
      }
    }
    return output;
  };

  const numberValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const clean = (value) => {
    const text = String(value ?? '').trim();
    return !text || ['unknown', 'unavailable', 'none', 'null'].includes(text.toLowerCase()) ? '' : text;
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const normaliseLevel = (value) => {
    const key = String(value ?? '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
    if (['emergency_warning', 'emergency', 'extreme'].includes(key)) return 'extreme';
    if (['watch_and_act', 'watch', 'severe'].includes(key)) return 'severe';
    if (['advice', 'moderate'].includes(key)) return 'moderate';
    if (['information', 'info', 'minor'].includes(key)) return 'minor';
    return 'none';
  };

  const iconFor = (value) => {
    const type = String(value ?? '').toLowerCase();
    if (type.includes('fire')) return '🔥';
    if (type.includes('flood') || type.includes('tsunami')) return '≋';
    if (type.includes('storm') || type.includes('thunder') || type.includes('lightning')) return 'ϟ';
    if (type.includes('wind') || type.includes('cyclone')) return '↯';
    if (type.includes('traffic') || type.includes('road') || type.includes('vehicle')) return '⚠';
    if (type.includes('rescue')) return '✚';
    if (type.includes('heat')) return '☀';
    if (type.includes('earthquake')) return '⌁';
    if (type.includes('hazardous') || type.includes('chemical')) return '☣';
    return '!';
  };

  const slugify = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const destination = ([longitude, latitude], bearing, distanceKm) => {
    const radius = 6371.0088;
    const angular = distanceKm / radius;
    const theta = bearing * Math.PI / 180;
    const lat1 = latitude * Math.PI / 180;
    const lon1 = longitude * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta));
    const lon2 = lon1 + Math.atan2(Math.sin(theta) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    return [((lon2 * 180 / Math.PI + 540) % 360) - 180, lat2 * 180 / Math.PI];
  };

  const haversine = ([lon1, lat1], [lon2, lat2]) => {
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const circleFeature = (center, radiusKm, steps = 96) => {
    const ring = [];
    for (let index = 0; index <= steps; index += 1) ring.push(destination(center, index / steps * 360, radiusKm));
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
  };

  const pointFeature = (point, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: point } });
  const lineFeature = (from, to) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [from, to] } });
  const fc = (features) => ({ type: 'FeatureCollection', features: features.filter(Boolean) });

  const normalisePair = (value) => {
    if (!Array.isArray(value) || value.length < 2) return null;
    const first = numberValue(value[0]);
    const second = numberValue(value[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    if (Math.abs(first) <= 90 && Math.abs(second) > 90 && Math.abs(second) <= 180) return [second, first];
    return [first, second];
  };

  const normaliseTree = (value) => {
    const pair = normalisePair(value);
    if (pair) return pair;
    if (!Array.isArray(value)) return null;
    const children = value.map(normaliseTree).filter(Boolean);
    return children.length ? children : null;
  };

  const parseMaybeJson = (value) => {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text) return null;
    if (/^POLYGON\s*\(\(/i.test(text)) {
      const ring = text.replace(/^POLYGON\s*\(\(/i, '').replace(/\)\)\s*$/i, '').split(',').map((pair) => normalisePair(pair.trim().split(/\s+/).map(Number))).filter(Boolean);
      return ring.length >= 3 ? { type: 'Polygon', coordinates: [ring] } : null;
    }
    try { return JSON.parse(text); } catch (_) { return null; }
  };

  const coordinatesToGeometry = (coordinates) => {
    const normalised = normaliseTree(coordinates);
    if (!Array.isArray(normalised) || !normalised.length) return null;
    const depth = (value) => Array.isArray(value) && value.length ? 1 + depth(value[0]) : 0;
    const coordinateDepth = depth(normalised);
    if (coordinateDepth === 2) return { type: 'Polygon', coordinates: [normalised] };
    if (coordinateDepth === 3) return { type: 'Polygon', coordinates: normalised };
    if (coordinateDepth >= 4) return { type: 'MultiPolygon', coordinates: normalised };
    return null;
  };

  const extractPoint = (attributes) => {
    if (!attributes || typeof attributes !== 'object') return null;
    const latitude = numberValue(attributes.latitude ?? attributes.lat);
    const longitude = numberValue(attributes.longitude ?? attributes.lon ?? attributes.lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [longitude, latitude];
    return normalisePair(attributes.coordinates ?? attributes.location);
  };

  const extractGeometry = (...sources) => {
    const keys = ['geojson', 'geometry', 'polygon', 'polygons', 'boundary', 'boundaries', 'perimeter', 'area'];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of keys) {
        const parsed = parseMaybeJson(source[key]);
        if (!parsed) continue;
        if (parsed.type === 'FeatureCollection') return parsed;
        if (parsed.type === 'Feature') return parsed;
        if (parsed.type && parsed.coordinates) return { type: 'Feature', properties: {}, geometry: { ...parsed, coordinates: normaliseTree(parsed.coordinates) ?? parsed.coordinates } };
        const geometry = coordinatesToGeometry(parsed);
        if (geometry) return { type: 'Feature', properties: {}, geometry };
      }
    }
    return null;
  };

  const geometryBounds = (geometryLike) => {
    const geometry = geometryLike?.type === 'Feature' ? geometryLike.geometry : geometryLike?.type === 'FeatureCollection' ? null : geometryLike;
    const points = [];
    const walk = (value) => {
      const pair = normalisePair(value);
      if (pair) { points.push(pair); return; }
      if (Array.isArray(value)) value.forEach(walk);
    };
    if (geometryLike?.type === 'FeatureCollection') geometryLike.features.forEach((feature) => walk(feature?.geometry?.coordinates));
    else walk(geometry?.coordinates);
    if (!points.length) return null;
    let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
    for (const [lon, lat] of points) {
      west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
    }
    return { west, south, east, north };
  };

  const boundsCenter = (bounds) => [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];

  const loadMapLibre = (scriptUrl) => {
    if (window.maplibregl?.Map) return Promise.resolve(window.maplibregl);
    if (mapLibrePromise) return mapLibrePromise;
    mapLibrePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-emergency-orbit-3d-maplibre="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.maplibregl), { once: true });
        existing.addEventListener('error', () => reject(new Error('MapLibre failed to load')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = scriptUrl || MAPLIBRE_SCRIPT;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.emergencyOrbit3dMaplibre = 'true';
      script.onload = () => window.maplibregl?.Map ? resolve(window.maplibregl) : reject(new Error('MapLibre loaded without exposing maplibregl'));
      script.onerror = () => reject(new Error(`Could not load MapLibre from ${script.src}`));
      document.head.appendChild(script);
    });
    mapLibrePromise.catch(() => { mapLibrePromise = null; });
    return mapLibrePromise;
  };


  window.__EOM3D = Object.freeze({TAG,VERSION,MAPLIBRE_VERSION,MAPLIBRE_SCRIPT,MAPLIBRE_CSS,EMPTY_FC,LEVELS,DEFAULTS,merge,numberValue,clean,escapeHtml,normaliseLevel,iconFor,slugify,destination,haversine,circleFeature,pointFeature,lineFeature,fc,normalisePair,normaliseTree,parseMaybeJson,coordinatesToGeometry,extractPoint,extractGeometry,geometryBounds,boundsCenter,loadMapLibre});
})();
