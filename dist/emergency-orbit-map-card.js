/* Emergency Orbit Map Card v0.3.2 - CSS 3D orbit + animated beacon */
const TAG = 'emergency-orbit-map-card';
const VERSION = '0.3.2';
const LEAFLET_VERSION = '1.9.4';

const LEAFLET_JS = [
  `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
  `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
];

const LEAFLET_CSS = [
  `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
  `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
];

const DEFAULTS = {
  title: 'Emergency Orbit',
  demo_mode: false,
  debug: false,
  entities: {
    incidents: 'sensor.abc_emergency_home_nearby_incidents',
    nearest: 'sensor.abc_emergency_home_nearest_incident',
    active: 'binary_sensor.abc_emergency_home_active_alert',
    inside_polygon: 'binary_sensor.abc_emergency_home_inside_polygon',
  },
  region: {
    mode: 'home',
    label: 'Local emergency region',
    radius_km: 40,
  },
  map: {
    height: 520,
    tile_url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tile_attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    tile_subdomains: 'abcd',
    overview_pitch: 42,
    overview_bearing: -18,
    incident_pitch: 58,
    incident_zoom: 14,
    max_zoom: 19,
  },
  camera: {
    orbit: true,
    orbit_duration: 18000,
    fly_duration: 2.8,
    auto_return: true,
    auto_return_delay: 4000,
  },
  display: {
    show_controls: true,
    show_region: true,
    show_home: true,
    show_incident_panel: true,
    show_clear_state: true,
    hide_non_urgent: true,
  },
};

const LEVELS = {
  none: { rank: 0, colour: '#4f8cff', label: 'INFORMATION' },
  minor: { rank: 1, colour: '#4f8cff', label: 'INFORMATION' },
  moderate: { rank: 2, colour: '#f5ce35', label: 'ADVICE' },
  severe: { rank: 3, colour: '#ff812d', label: 'WATCH AND ACT' },
  extreme: { rank: 4, colour: '#ff414b', label: 'EMERGENCY WARNING' },
};

let leafletPromise = null;

const deepMerge = (base, next) => Object.fromEntries(
  Object.keys({ ...base, ...next }).map((key) => {
    const left = base?.[key];
    const right = next?.[key];
    const mergeable = left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right);
    return [key, mergeable ? deepMerge(left, right) : right ?? left];
  })
);

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clean = (value) => {
  const text = String(value ?? '').trim();
  return !text || ['unknown', 'unavailable', 'none', 'null'].includes(text.toLowerCase()) ? '' : text;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '\u0026amp;',
  '<': '\u0026lt;',
  '>': '\u0026gt;',
  '"': '\u0026quot;',
  "'": '&#39;',
})[character]);

const normaliseLevel = (value) => {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
  if (['emergency_warning', 'emergency', 'extreme'].includes(key)) return 'extreme';
  if (['watch_and_act', 'watch', 'severe'].includes(key)) return 'severe';
  if (['advice', 'moderate'].includes(key)) return 'moderate';
  if (['information', 'info', 'minor'].includes(key)) return 'minor';
  return 'none';
};

const incidentIcon = (value) => {
  const type = String(value ?? '').toLowerCase();
  if (type.includes('fire')) return '🔥';
  if (type.includes('flood')) return '≋';
  if (type.includes('storm') || type.includes('thunder')) return 'ϟ';
  if (type.includes('wind') || type.includes('cyclone')) return '↯';
  if (type.includes('traffic') || type.includes('road') || type.includes('vehicle')) return '⚠';
  if (type.includes('rescue')) return '✚';
  return '!';
};

const destination = ([longitude, latitude], bearing, distanceKm) => {
  const radius = 6371;
  const distance = distanceKm / radius;
  const bearingRad = bearing * Math.PI / 180;
  const latitudeRad = latitude * Math.PI / 180;
  const longitudeRad = longitude * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRad) * Math.cos(distance) +
    Math.cos(latitudeRad) * Math.sin(distance) * Math.cos(bearingRad)
  );
  const destinationLongitude = longitudeRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distance) * Math.cos(latitudeRad),
    Math.cos(distance) - Math.sin(latitudeRad) * Math.sin(destinationLatitude)
  );
  return [((destinationLongitude * 180 / Math.PI + 540) % 360) - 180, destinationLatitude * 180 / Math.PI];
};

const getRegion = (config, hass) => {
  const home = [numberValue(hass?.config?.longitude) ?? 150.7, numberValue(hass?.config?.latitude) ?? -34.05];
  const region = config.region ?? {};
  if (region.mode === 'custom') {
    return {
      centre: [numberValue(region.longitude) ?? home[0], numberValue(region.latitude) ?? home[1]],
      radius: numberValue(region.radius_km) ?? 40,
      label: region.label || 'Custom region',
    };
  }
  if (region.mode === 'bounds') {
    const west = numberValue(region.west);
    const east = numberValue(region.east);
    const south = numberValue(region.south);
    const north = numberValue(region.north);
    if ([west, east, south, north].every(Number.isFinite)) {
      return { centre: [(west + east) / 2, (south + north) / 2], bounds: [[south, west], [north, east]], label: region.label || 'Defined region' };
    }
  }
  return { centre: home, radius: numberValue(region.radius_km) ?? 40, label: region.label || 'Home region' };
};

const extractPoint = (attributes) => {
  if (!attributes || typeof attributes !== 'object') return null;
  const latitude = numberValue(attributes.latitude ?? attributes.lat);
  const longitude = numberValue(attributes.longitude ?? attributes.lon ?? attributes.lng);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [longitude, latitude];
  const coordinates = attributes.coordinates ?? attributes.location;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const first = numberValue(coordinates[0]);
  const second = numberValue(coordinates[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first) <= 90 && Math.abs(second) > 90 ? [second, first] : [first, second];
};

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return null;
  if (/^POLYGON\s*\(\(/i.test(text)) {
    const ring = text.replace(/^POLYGON\s*\(\(/i, '').replace(/\)\)\s*$/i, '').split(',').map((pair) => pair.trim().split(/\s+/).map(Number)).filter((pair) => pair.length >= 2 && pair.every(Number.isFinite));
    return ring.length >= 3 ? { type: 'Polygon', coordinates: [ring] } : null;
  }
  try { return JSON.parse(text); } catch { return null; }
};

const coordinatesToGeometry = (coordinates) => {
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  if (coordinates.length >= 2 && coordinates.every((entry) => Number.isFinite(Number(entry)))) return null;
  const depth = (value) => Array.isArray(value) && value.length ? 1 + depth(value[0]) : 0;
  const coordinateDepth = depth(coordinates);
  if (coordinateDepth === 2) return { type: 'Polygon', coordinates: [coordinates] };
  if (coordinateDepth === 3) return { type: 'Polygon', coordinates };
  if (coordinateDepth >= 4) return { type: 'MultiPolygon', coordinates };
  return null;
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
      if (parsed.type && parsed.coordinates) return { type: 'Feature', properties: {}, geometry: parsed };
      const geometry = coordinatesToGeometry(parsed);
      if (geometry) return { type: 'Feature', properties: {}, geometry };
    }
  }
  return null;
};

const loadScript = (url) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  const timeout = window.setTimeout(() => {
    script.remove();
    reject(new Error(`Timed out loading ${url}`));
  }, 20000);
  script.src = url;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    clearTimeout(timeout);
    window.L ? resolve(window.L) : reject(new Error(`Leaflet loaded without exposing L: ${url}`));
  };
  script.onerror = () => {
    clearTimeout(timeout);
    script.remove();
    reject(new Error(`Failed to load ${url}`));
  };
  document.head.append(script);
});

const loadLeaflet = () => {
  if (window.L && typeof window.L.map === 'function') {
    return Promise.resolve(window.L);
  }
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    for (let i = 0; i < 30; i++) {
      if (window.L && typeof window.L.map === 'function') return window.L;
      await new Promise((r) => setTimeout(r, 100));
    }
    const failures = [];
    for (const url of LEAFLET_JS) {
      try { return await loadScript(url); }
      catch (error) { failures.push(error.message); }
    }
    if (window.L && typeof window.L.map === 'function') return window.L;
    throw new Error(`Leaflet not available. HA did not expose L and CDN failed: ${failures.join(' | ')}`);
  })();
  leafletPromise.catch(() => { leafletPromise = null; });
  return leafletPromise;
};

class EmergencyOrbitMapCard extends HTMLElement {
  static getStubConfig() { return deepMerge(DEFAULTS, { demo_mode: true }); }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = DEFAULTS;
    this._map = null;
    this._initialising = false;
    this._ready = false;
    this._layers = new Map();
    this._incidents = [];
    this._previousLevels = new Map();
    this._selectedId = null;
    this._animationToken = 0;
    this._orbitFrame = 0;
    this._returnTimer = 0;
    this._updateFrame = 0;
    this._bearing = DEFAULTS.map.overview_bearing;
    this._pitch = DEFAULTS.map.overview_pitch;
  }

  setConfig(config) {
    if (!config) throw new Error('Emergency Orbit Map Card requires configuration.');
    this._config = deepMerge(DEFAULTS, config);
    this._render();
    if (this.isConnected) this._initialise();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot.innerHTML) this._render();
    cancelAnimationFrame(this._updateFrame);
    this._updateFrame = requestAnimationFrame(() => this._updateIncidents());
  }

  connectedCallback() { this._initialise(); }

  disconnectedCallback() {
    this._stopCamera();
    cancelAnimationFrame(this._updateFrame);
    this._map?.remove();
    this._map = null;
    this._ready = false;
  }

  getCardSize() { return Math.ceil((numberValue(this._config.map.height) ?? 520) / 50); }

  getGridOptions() {
    return { columns: 12, rows: Math.ceil((numberValue(this._config.map.height) ?? 520) / 56), min_columns: 6, min_rows: 4 };
  }

  _render() {
    if (this._map) {
      try { this._map.remove(); } catch (_) {}
      this._map = null;
      this._ready = false;
      this._layers.clear();
      this._homeMarker = null;
    }
    const height = numberValue(this._config.map.height) ?? 520;
    const cssLinks = LEAFLET_CSS.map((url) => `<link rel="stylesheet" href="${url}">`).join('');
    this.shadowRoot.innerHTML = `
      ${cssLinks}
      <style>
        :host{display:block}
        ha-card{position:relative;height:${height}px;overflow:hidden;border-radius:16px;color:#fff;background:#07101d}
        .viewport{position:absolute;inset:0;overflow:hidden;background:#07101d}
        .scene{position:absolute;inset:-14%;transform-origin:50% 50%;will-change:transform;transition:transform 1.4s cubic-bezier(.2,.75,.2,1)}
        .map{position:absolute;inset:0;background:#07101d}
        .leaflet-container{overflow:hidden;outline:0;background:#07101d;font-family:system-ui}
        .leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box{position:absolute;left:0;top:0}
        .leaflet-container img.leaflet-tile{max-width:none!important;max-height:none!important;width:256px;height:256px}
        .leaflet-tile{visibility:hidden}.leaflet-tile-loaded{visibility:inherit}
        .leaflet-zoom-animated{transform-origin:0 0}
        .leaflet-control-container{position:absolute;inset:0;pointer-events:none}
        .leaflet-bottom{position:absolute;bottom:0}.leaflet-right{right:0}
        .leaflet-control{pointer-events:auto}
        .leaflet-control-attribution{margin:0 5px 4px 0;padding:2px 5px;border-radius:5px;background:rgba(3,8,16,.65);color:#93a4bb;font-size:9px}
        .leaflet-control-attribution a{color:#b9c8dd}
        .leaflet-marker-icon{display:block}
        .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(2,6,14,.65),transparent 27%,transparent 66%,rgba(2,6,14,.88))}
        .header{position:absolute;top:14px;left:16px;right:16px;pointer-events:none}
        .title{font:700 16px system-ui}
        .region{margin-top:3px;color:#b9c7db;font:600 11px system-ui;text-transform:uppercase;letter-spacing:.12em}
        .clear{position:absolute;left:16px;bottom:16px;padding:10px 12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(5,10,20,.78);color:#c7d2e3;font:600 12px system-ui;backdrop-filter:blur(12px)}
        .panel{position:absolute;left:16px;right:16px;bottom:14px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid color-mix(in srgb,var(--severity) 70%,transparent);border-radius:14px;background:rgba(5,10,20,.9);backdrop-filter:blur(12px)}
        .badge{width:42px;height:42px;display:grid;place-items:center;border-radius:11px;color:var(--severity);background:color-mix(in srgb,var(--severity) 18%,#07101d);font-size:23px}
        .severity{color:var(--severity);font:800 10px system-ui;letter-spacing:.11em}
        .type{font:800 13px system-ui}
        .headline{margin-top:3px;font:600 13px system-ui}
        .meta{margin-top:4px;color:#aab7ca;font:500 11px system-ui}
        .controls{display:flex;gap:6px}
        .control{padding:8px 10px;border:1px solid rgba(255,255,255,.16);border-radius:9px;color:#fff;background:rgba(255,255,255,.08);cursor:pointer}
        .incident-pin{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50% 50% 50% 7px;transform:rotate(-45deg);color:#fff;background:var(--pin-colour);box-shadow:0 0 0 6px color-mix(in srgb,var(--pin-colour) 25%,transparent),0 8px 22px #0009}
        .incident-pin span{transform:rotate(45deg);font-size:18px}
        .beacon{width:28px;height:28px;position:relative}
        .beacon-core{position:absolute;inset:6px;border-radius:50%;background:#fff;box-shadow:0 0 10px #fff}
        .beacon-ring{position:absolute;inset:0;border-radius:50%;border:2px solid #fff;opacity:0;animation:beaconPulse 2.4s ease-out infinite}
        .beacon-ring:nth-child(2){animation-delay:1.2s}
        .beacon.danger .beacon-core{background:#ff414b;box-shadow:0 0 12px #ff414b}
        .beacon.danger .beacon-ring{border-color:#ff414b}
        @keyframes beaconPulse{0%{transform:scale(0.4);opacity:0.85}100%{transform:scale(2.6);opacity:0}}
        .status{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:24px;text-align:center;color:#fff;background:#07101d;font:600 13px system-ui}
        .status[hidden]{display:none!important}
        .status small{display:block;margin-top:10px;color:#8fb4df;font-weight:500}
        @media(max-width:650px){.panel{grid-template-columns:36px minmax(0,1fr)}.badge{width:36px;height:36px}.controls{grid-column:1/-1;justify-content:flex-end}}
      </style>
      <ha-card>
        <div class="viewport"><div class="scene"><div class="map"></div></div></div><div class="shade"></div>
        <div class="header"><div class="title">${escapeHtml(this._config.title)}</div><div class="region"></div></div>
        <div class="clear">No active emergency incidents</div>
        <div class="panel" hidden><div class="badge"></div><div><div><span class="severity"></span> · <span class="type"></span></div><div class="headline"></div><div class="meta"></div></div><div class="controls"><button class="control" data-action="overview">Overview</button><button class="control" data-action="orbit">Orbit</button></div></div>
        <div class="status"><div>Loading map…<small>Card ${VERSION}</small></div></div>
      </ha-card>`;

    this._elements = {
      scene: this.shadowRoot.querySelector('.scene'),
      map: this.shadowRoot.querySelector('.map'),
      region: this.shadowRoot.querySelector('.region'),
      clear: this.shadowRoot.querySelector('.clear'),
      panel: this.shadowRoot.querySelector('.panel'),
      badge: this.shadowRoot.querySelector('.badge'),
      severity: this.shadowRoot.querySelector('.severity'),
      type: this.shadowRoot.querySelector('.type'),
      headline: this.shadowRoot.querySelector('.headline'),
      meta: this.shadowRoot.querySelector('.meta'),
      status: this.shadowRoot.querySelector('.status'),
    };
    this.shadowRoot.querySelector('[data-action="overview"]').addEventListener('click', () => this._showOverview(true));
    this.shadowRoot.querySelector('[data-action="orbit"]').addEventListener('click', () => this._focusIncident(this._incidents.find((item) => item.id === this._selectedId) ?? this._incidents[0], true));
  }

  _setStatus(message, detail = '') {
    if (!this._elements?.status) return;
    this._elements.status.hidden = false;
    this._elements.status.style.display = '';
    this._elements.status.innerHTML = `<div>${escapeHtml(message)}<small>${escapeHtml(detail || `Card ${VERSION}`)}</small></div>`;
  }

  _hideStatus() {
    if (!this._elements?.status) return;
    this._elements.status.hidden = true;
    this._elements.status.style.display = 'none';
  }

  async _initialise() {
    if (this._map || this._initialising || !this._elements?.map) return;
    if (this._elements.map._leaflet_id) return;
    this._initialising = true;
    try {
      this._setStatus('Loading map…', `Card ${VERSION}`);
      this._leaflet = await loadLeaflet();
      console.info(`[${TAG}] Leaflet ready`, this._leaflet && this._leaflet.version);
      if (this._map || this._elements.map._leaflet_id) return;
      const region = getRegion(this._config, this._hass);
      this._elements.region.textContent = region.label;
      const initialLat = region.centre[1];
      const initialLng = region.centre[0];
      this._map = this._leaflet.map(this._elements.map, {
        center: [initialLat, initialLng],
        zoom: 10,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        worldCopyJump: true,
      });
      this._leaflet.tileLayer(this._config.map.tile_url, {
        attribution: this._config.map.tile_attribution,
        subdomains: this._config.map.tile_subdomains,
        maxZoom: numberValue(this._config.map.max_zoom) ?? 19,
        updateWhenIdle: false,
        keepBuffer: 3,
      }).addTo(this._map);
      this._ready = true;
      this._hideStatus();
      this._createHomeBeacon(region);
      this._map.invalidateSize(false);
      this._showOverview(false);
      window.setTimeout(() => {
        this._map?.invalidateSize(false);
        this._hideStatus();
        this._updateIncidents();
      }, 150);
    } catch (error) {
      console.error(`[${TAG}]`, error);
      this._setStatus('Emergency map failed to start.', error.message);
    } finally {
      this._initialising = false;
    }
  }

  _createHomeBeacon(region) {
    if (!this._config.display.show_home) return;
    const inside = this._hass?.states?.[this._config.entities.inside_polygon]?.state === 'on';
    const html = `<div class="beacon${inside ? ' danger' : ''}"><div class="beacon-ring"></div><div class="beacon-ring"></div><div class="beacon-core"></div></div>`;
    const icon = this._leaflet.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] });
    this._homeMarker = this._leaflet.marker(
      [numberValue(this._hass?.config?.latitude) ?? region.centre[1], numberValue(this._hass?.config?.longitude) ?? region.centre[0]],
      { icon, interactive: false, zIndexOffset: 900 }
    ).addTo(this._map);
  }

  _updateHomeBeacon() {
    if (!this._homeMarker) return;
    const inside = this._hass?.states?.[this._config.entities.inside_polygon]?.state === 'on';
    const html = `<div class="beacon${inside ? ' danger' : ''}"><div class="beacon-ring"></div><div class="beacon-ring"></div><div class="beacon-core"></div></div>`;
    this._homeMarker.setIcon(this._leaflet.divIcon({ className: '', html, iconSize: [28, 28], iconAnchor: [14, 14] }));
  }

  _collectIncidents() {
    if (this._config.demo_mode) {
      const region = getRegion(this._config, this._hass);
      const samples = [['Bushfire', 'severe'], ['Flood', 'moderate'], ['Storm Warning', 'extreme'], ['Traffic Incident', 'minor']];
      return samples.map(([type, level], index) => ({
        id: `demo-${index}`,
        type,
        level,
        headline: `Demonstration ${type.toLowerCase()} incident`,
        point: destination(region.centre, 35 + index * 82, 8 + index * 5),
        distance: 8 + index * 5,
        direction: 'inside the selected region',
        status: 'Demo data',
        geometry: null,
      }));
    }

    const entities = this._config.entities;
    const nearby = this._hass?.states?.[entities.incidents];
    const base = Array.isArray(nearby?.attributes?.incidents) ? nearby.attributes.incidents : [];
    const generatedIds = Array.isArray(nearby?.attributes?.entity_ids) ? nearby.attributes.entity_ids : [];
    const incidents = base.map((raw, index) => {
      const slug = String(raw.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const generatedId = generatedIds.find((id) => slug && String(id).endsWith(slug)) ?? generatedIds[index];
      const generated = generatedId ? this._hass?.states?.[generatedId] : null;
      const attributes = generated?.attributes ?? {};
      const type = clean(attributes.event_type ?? raw.event_type ?? 'Emergency incident');
      if (this._config.display.hide_non_urgent && type.toLowerCase() === 'other non-urgent alerts') return null;
      return {
        id: String(raw.id ?? generatedId ?? index),
        type,
        level: normaliseLevel(attributes.alert_level ?? raw.alert_level),
        headline: clean(attributes.headline ?? attributes.friendly_name ?? raw.headline ?? 'Incident details updating'),
        point: extractPoint(attributes) ?? extractPoint(raw),
        distance: numberValue(generated?.state ?? raw.distance_km),
        direction: clean(attributes.direction ?? raw.direction),
        status: clean(attributes.status ?? raw.status),
        geometry: extractGeometry(attributes, raw),
      };
    }).filter((incident) => incident?.point);

    if (!incidents.length) {
      const nearest = this._hass?.states?.[entities.nearest];
      const attributes = nearest?.attributes ?? {};
      const point = extractPoint(attributes);
      if (nearest && point) {
        incidents.push({
          id: nearest.entity_id,
          type: clean(attributes.event_type ?? 'Emergency incident'),
          level: normaliseLevel(attributes.alert_level),
          headline: clean(attributes.headline ?? attributes.friendly_name ?? 'Incident details updating'),
          point,
          distance: numberValue(nearest.state),
          direction: clean(attributes.direction),
          status: clean(attributes.status),
          geometry: extractGeometry(attributes),
        });
      }
    }

    return incidents.sort((left, right) => LEVELS[right.level].rank - LEVELS[left.level].rank || (left.distance ?? 99999) - (right.distance ?? 99999));
  }

  _updateIncidents() {
    if (!this._hass && !this._config.demo_mode) return;
    const incidents = this._collectIncidents();
    const previous = this._previousLevels;
    this._incidents = incidents;
    this._previousLevels = new Map(incidents.map((incident) => [incident.id, incident.level]));
    if (this._ready) {
      this._drawLayers();
      this._updateHomeBeacon();
    }
    const important = incidents.find((incident) => !previous.has(incident.id) || LEVELS[incident.level].rank > LEVELS[previous.get(incident.id) ?? 'none'].rank);
    if (important && this._ready) this._focusIncident(important, true);
  }

  _drawLayers() {
    const active = new Set(this._incidents.map((incident) => incident.id));
    for (const incident of this._incidents) {
      const severity = LEVELS[incident.level];
      let item = this._layers.get(incident.id);
      const markerIcon = this._leaflet.divIcon({
        className: '',
        html: `<div class="incident-pin" style="--pin-colour:${severity.colour}"><span>${incidentIcon(incident.type)}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });
      if (!item) {
        const marker = this._leaflet.marker([incident.point[1], incident.point[0]], {
          icon: markerIcon,
          keyboard: true,
          title: incident.headline,
          zIndexOffset: 1000 + severity.rank * 100,
        }).addTo(this._map);
        marker.on('click', () => this._focusIncident(incident, true));
        item = { marker, polygon: null, geometryKey: '' };
        this._layers.set(incident.id, item);
      } else {
        item.marker.setLatLng([incident.point[1], incident.point[0]]).setIcon(markerIcon);
      }

      const geometryKey = incident.geometry ? JSON.stringify(incident.geometry) : '';
      if (geometryKey !== item.geometryKey) {
        item.polygon?.remove();
        item.polygon = null;
        item.geometryKey = geometryKey;
        if (incident.geometry) {
          try {
            item.polygon = this._leaflet.geoJSON(incident.geometry, {
              style: { color: severity.colour, weight: 3, opacity: 0.9, fillColor: severity.colour, fillOpacity: 0.17 },
            }).addTo(this._map);
          } catch (error) {
            console.warn(`[${TAG}] Invalid polygon for ${incident.id}`, error);
          }
        }
      }
    }

    for (const [id, item] of this._layers) {
      if (!active.has(id)) {
        item.marker.remove();
        item.polygon?.remove();
        this._layers.delete(id);
      }
    }
    this._elements.clear.hidden = !this._config.display.show_clear_state || this._incidents.length > 0;
    if (!this._incidents.length) this._elements.panel.hidden = true;
  }

  _focusIncident(incident, animate) {
    if (!incident || !this._ready) return;
    this._stopCamera();
    this._selectedId = incident.id;
    const severity = LEVELS[incident.level];
    if (this._config.display.show_incident_panel) {
      this._elements.panel.hidden = false;
      this._elements.panel.style.setProperty('--severity', severity.colour);
      this._elements.badge.textContent = incidentIcon(incident.type);
      this._elements.severity.textContent = severity.label;
      this._elements.type.textContent = incident.type.toUpperCase();
      this._elements.headline.textContent = incident.headline;
      this._elements.meta.textContent = [
        Number.isFinite(incident.distance) ? `${incident.distance.toFixed(1)} km` : '',
        incident.direction,
        incident.status,
      ].filter(Boolean).join(' · ');
    }
    this._applySceneTransform(this._config.map.incident_pitch, this._bearing, 1.22, true);
    const token = ++this._animationToken;
    const layer = this._layers.get(incident.id);
    if (layer?.polygon) {
      this._map.flyToBounds(layer.polygon.getBounds(), {
        padding: [90, 90],
        maxZoom: numberValue(this._config.map.incident_zoom) ?? 14,
        duration: animate ? numberValue(this._config.camera.fly_duration) ?? 2.8 : 0,
      });
    } else {
      this._map.flyTo([incident.point[1], incident.point[0]], numberValue(this._config.map.incident_zoom) ?? 14, {
        duration: animate ? numberValue(this._config.camera.fly_duration) ?? 2.8 : 0,
      });
    }
    const startOrbit = () => {
      this._map.off('moveend', startOrbit);
      if (token !== this._animationToken) return;
      this._config.camera.orbit ? this._orbitIncident(incident, token) : this._scheduleReturn(token);
    };
    this._map.once('moveend', startOrbit);
    if (!animate) startOrbit();
  }

  _orbitIncident(incident, token) {
    const start = performance.now();
    const duration = Math.max(8000, numberValue(this._config.camera.orbit_duration) ?? 18000);
    const initialBearing = this._bearing;
    const frame = (now) => {
      if (token !== this._animationToken) return;
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      this._applySceneTransform(this._config.map.incident_pitch, initialBearing + 360 * eased, 1.22, false);
      if (progress < 1) this._orbitFrame = requestAnimationFrame(frame);
      else {
        this._bearing = ((initialBearing + 360) % 360 + 360) % 360;
        this._scheduleReturn(token);
      }
    };
    this._orbitFrame = requestAnimationFrame(frame);
  }

  _scheduleReturn(token) {
    if (!this._config.camera.auto_return) return;
    this._returnTimer = window.setTimeout(() => {
      if (token === this._animationToken) this._showOverview(true);
    }, numberValue(this._config.camera.auto_return_delay) ?? 4000);
  }

  _showOverview(animate) {
    if (!this._ready) return;
    this._stopCamera();
    this._selectedId = null;
    this._elements.panel.hidden = true;
    const region = getRegion(this._config, this._hass);
    let bounds = region.bounds;
    if (!bounds) {
      const southwest = destination(region.centre, 225, region.radius);
      const northeast = destination(region.centre, 45, region.radius);
      bounds = [[southwest[1], southwest[0]], [northeast[1], northeast[0]]];
    }
    this._bearing = numberValue(this._config.map.overview_bearing) ?? -18;
    this._pitch = numberValue(this._config.map.overview_pitch) ?? 42;
    this._applySceneTransform(this._pitch, this._bearing, 1.12, animate);
    this._map.flyToBounds(bounds, {
      padding: [70, 70],
      maxZoom: 12,
      duration: animate ? 1.8 : 0,
    });
  }

  _applySceneTransform(pitch, bearing, scale, transition) {
    this._pitch = numberValue(pitch) ?? 42;
    this._bearing = numberValue(bearing) ?? -18;
    if (!this._elements?.scene) return;
    this._elements.scene.style.transition = transition ? 'transform 1.4s cubic-bezier(.2,.75,.2,1)' : 'none';
    this._elements.scene.style.transform = `perspective(1400px) rotateX(${this._pitch}deg) rotateZ(${this._bearing}deg) scale(${scale})`;
  }

  _stopCamera() {
    this._animationToken += 1;
    cancelAnimationFrame(this._orbitFrame);
    clearTimeout(this._returnTimer);
    this._orbitFrame = 0;
    this._returnTimer = 0;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, EmergencyOrbitMapCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: 'Emergency Orbit Map Card',
    description: 'Emergency map with CSS 3D orbit, animated home beacon, live incidents and ABC Emergency support.',
  });
}
console.info('%c EMERGENCY ORBIT MAP CARD %c v0.3.2 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
