/* Emergency Orbit Map Card v0.1.3-alpha */
const TAG = 'emergency-orbit-map-card';
const VERSION = '0.1.3-alpha';
const MAPLIBRE_VERSION = '5.24.0';

const MAPLIBRE_JS = [
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-csp.js`,
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-csp.js`,
];

const MAPLIBRE_CSS = [
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`,
  `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`,
];

const BASEMAPS = [
  'https://tiles.openfreemap.org/styles/dark',
  'https://tiles.openfreemap.org/styles/liberty',
  'https://demotiles.maplibre.org/style.json',
];

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#07101d' },
    },
  ],
};

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
    style_url: BASEMAPS[0],
    terrain: true,
    terrain_url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    terrain_exaggeration: 1.25,
    overview_pitch: 48,
    overview_bearing: -18,
    incident_pitch: 62,
    incident_zoom: 14.2,
  },
  camera: {
    orbit: true,
    orbit_duration: 22000,
    auto_return: true,
    auto_return_delay: 30000,
  },
};

const LEVELS = {
  none: { rank: 0, colour: '#4f8cff', label: 'INFORMATION' },
  minor: { rank: 1, colour: '#4f8cff', label: 'INFORMATION' },
  moderate: { rank: 2, colour: '#f5ce35', label: 'ADVICE' },
  severe: { rank: 3, colour: '#ff812d', label: 'WATCH AND ACT' },
  extreme: { rank: 4, colour: '#ff414b', label: 'EMERGENCY WARNING' },
};

let mapLibrePromise = null;

const deepMerge = (base, next) => Object.fromEntries(
  Object.keys({ ...base, ...next }).map((key) => {
    const left = base?.[key];
    const right = next?.[key];
    const mergeable =
      left && right &&
      typeof left === 'object' &&
      typeof right === 'object' &&
      !Array.isArray(left) &&
      !Array.isArray(right);
    return [key, mergeable ? deepMerge(left, right) : right ?? left];
  })
);

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clean = (value) => {
  const text = String(value ?? '').trim();
  return !text || ['unknown', 'unavailable', 'none', 'null'].includes(text.toLowerCase())
    ? ''
    : text;
};

const escapeHtml = (value) => String(value ?? '').replace(
  /[&<>"']/g,
  (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]
);

const normaliseLevel = (value) => {
  const key = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '');

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
  const angularDistance = distanceKm / radius;
  const bearingRadians = bearing * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;

  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance) +
    Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );

  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude)
  );

  return [
    ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
    destinationLatitude * 180 / Math.PI,
  ];
};

const getRegion = (config, hass) => {
  const home = [
    numberValue(hass?.config?.longitude) ?? 150.7,
    numberValue(hass?.config?.latitude) ?? -34.05,
  ];
  const region = config.region ?? {};

  if (region.mode === 'custom') {
    return {
      centre: [
        numberValue(region.longitude) ?? home[0],
        numberValue(region.latitude) ?? home[1],
      ],
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
      return {
        centre: [(west + east) / 2, (south + north) / 2],
        bounds: [[west, south], [east, north]],
        label: region.label || 'Defined region',
      };
    }
  }

  return {
    centre: home,
    radius: numberValue(region.radius_km) ?? 40,
    label: region.label || 'Home region',
  };
};

const extractPoint = (attributes) => {
  if (!attributes || typeof attributes !== 'object') return null;

  const latitude = numberValue(attributes.latitude ?? attributes.lat);
  const longitude = numberValue(attributes.longitude ?? attributes.lon ?? attributes.lng);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [longitude, latitude];
  }

  const coordinates = attributes.coordinates ?? attributes.location;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const first = numberValue(coordinates[0]);
  const second = numberValue(coordinates[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  return Math.abs(first) <= 90 && Math.abs(second) > 90
    ? [second, first]
    : [first, second];
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
    if (window.maplibregl) resolve(window.maplibregl);
    else reject(new Error(`MapLibre loaded without exposing maplibregl: ${url}`));
  };
  script.onerror = () => {
    clearTimeout(timeout);
    script.remove();
    reject(new Error(`Failed to load ${url}`));
  };
  document.head.append(script);
});

const loadMapLibre = async () => {
  if (window.maplibregl) return window.maplibregl;
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = (async () => {
    const failures = [];
    for (const url of MAPLIBRE_JS) {
      try {
        return await loadScript(url);
      } catch (error) {
        failures.push(error.message);
      }
    }
    throw new Error(`MapLibre CSP build failed to load. ${failures.join(' | ')}`);
  })();

  mapLibrePromise.catch(() => { mapLibrePromise = null; });
  return mapLibrePromise;
};

class EmergencyOrbitMapCard extends HTMLElement {
  static getStubConfig() {
    return deepMerge(DEFAULTS, { demo_mode: true });
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = DEFAULTS;
    this._map = null;
    this._mapReady = false;
    this._markers = new Map();
    this._incidents = [];
    this._previousLevels = new Map();
    this._selectedId = null;
    this._animationToken = 0;
    this._orbitFrame = 0;
    this._returnTimer = 0;
    this._startupTimer = 0;
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
    this._updateIncidents();
  }

  connectedCallback() {
    this._initialise();
  }

  disconnectedCallback() {
    this._stopCamera();
    clearTimeout(this._startupTimer);
    this._map?.remove();
    this._map = null;
    this._mapReady = false;
  }

  getCardSize() {
    return Math.ceil((numberValue(this._config.map.height) ?? 520) / 50);
  }

  getGridOptions() {
    return {
      columns: 12,
      rows: Math.ceil((numberValue(this._config.map.height) ?? 520) / 56),
      min_columns: 6,
      min_rows: 4,
    };
  }

  _render() {
    const height = numberValue(this._config.map.height) ?? 520;
    const cssLinks = MAPLIBRE_CSS.map(
      (url) => `<link rel="stylesheet" href="${url}">`
    ).join('');

    this.shadowRoot.innerHTML = `
      ${cssLinks}
      <style>
        :host { display: block; }
        ha-card { position:relative; height:${height}px; overflow:hidden; border-radius:16px; color:#fff; background:#07101d; }
        .map { position:absolute; inset:0; }
        .shade { position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg,rgba(2,6,14,.65),transparent 27%,transparent 67%,rgba(2,6,14,.86)); }
        .header { position:absolute; top:14px; left:16px; right:16px; pointer-events:none; }
        .title { font:700 16px system-ui; }
        .region { margin-top:3px; font:600 11px system-ui; color:#b9c7db; text-transform:uppercase; letter-spacing:.12em; }
        .clear-state { position:absolute; left:16px; bottom:16px; padding:10px 12px; border:1px solid rgba(255,255,255,.14); border-radius:12px; background:rgba(5,10,20,.76); color:#c7d2e3; font:600 12px system-ui; backdrop-filter:blur(12px); }
        .panel { position:absolute; left:16px; right:16px; bottom:14px; display:grid; grid-template-columns:42px minmax(0,1fr) auto; gap:12px; align-items:center; padding:14px 16px; border:1px solid color-mix(in srgb,var(--severity) 70%,transparent); border-radius:14px; background:rgba(5,10,20,.89); backdrop-filter:blur(12px); }
        .badge { width:42px; height:42px; display:grid; place-items:center; border-radius:11px; color:var(--severity); background:color-mix(in srgb,var(--severity) 18%,#07101d); font-size:23px; }
        .severity { color:var(--severity); font:800 10px system-ui; letter-spacing:.11em; }
        .type { font:800 13px system-ui; }
        .headline { margin-top:3px; font:600 13px system-ui; }
        .meta { margin-top:4px; color:#aab7ca; font:500 11px system-ui; }
        .controls { display:flex; gap:6px; }
        button.control { padding:8px 10px; border:1px solid rgba(255,255,255,.16); border-radius:9px; color:#fff; background:rgba(255,255,255,.08); cursor:pointer; }
        .marker { width:34px; height:34px; border:0; border-radius:50% 50% 50% 5px; transform:rotate(-45deg); color:#fff; background:var(--marker-colour); box-shadow:0 0 0 5px color-mix(in srgb,var(--marker-colour) 25%,transparent),0 8px 22px #0008; cursor:pointer; }
        .marker span { display:block; transform:rotate(45deg); font-size:17px; }
        .home-marker { width:28px; height:28px; display:grid; place-items:center; border:2px solid #fff; border-radius:50%; color:#fff; background:#07101d; box-shadow:0 5px 18px #0009; font-size:17px; }
        .status { position:absolute; inset:0; z-index:20; display:grid; place-items:center; padding:24px; text-align:center; color:#fff; background:#07101d; font:600 13px system-ui; }
        .status small { display:block; margin-top:10px; color:#8fb4df; font-weight:500; }
        @media(max-width:650px){.panel{grid-template-columns:36px minmax(0,1fr)}.badge{width:36px;height:36px}.controls{grid-column:1/-1;justify-content:flex-end}}
      </style>
      <ha-card>
        <div class="map"></div><div class="shade"></div>
        <div class="header"><div class="title">${escapeHtml(this._config.title)}</div><div class="region"></div></div>
        <div class="clear-state">No active emergency incidents</div>
        <div class="panel" hidden><div class="badge"></div><div><div><span class="severity"></span> · <span class="type"></span></div><div class="headline"></div><div class="meta"></div></div><div class="controls"><button class="control" data-action="overview">Overview</button><button class="control" data-action="orbit">Orbit</button></div></div>
        <div class="status"><div>Loading local CSP map engine…<small>Card ${VERSION}</small></div></div>
      </ha-card>`;

    this._elements = {
      map: this.shadowRoot.querySelector('.map'),
      region: this.shadowRoot.querySelector('.region'),
      clear: this.shadowRoot.querySelector('.clear-state'),
      panel: this.shadowRoot.querySelector('.panel'),
      badge: this.shadowRoot.querySelector('.badge'),
      severity: this.shadowRoot.querySelector('.severity'),
      type: this.shadowRoot.querySelector('.type'),
      headline: this.shadowRoot.querySelector('.headline'),
      meta: this.shadowRoot.querySelector('.meta'),
      status: this.shadowRoot.querySelector('.status'),
    };

    this.shadowRoot.querySelector('[data-action="overview"]').addEventListener('click', () => this._showOverview(true));
    this.shadowRoot.querySelector('[data-action="orbit"]').addEventListener('click', () => {
      const incident = this._incidents.find((item) => item.id === this._selectedId) ?? this._incidents[0];
      this._focusIncident(incident, true);
    });
  }

  _setStatus(message, detail = '') {
    if (!this._elements?.status) return;
    this._elements.status.hidden = false;
    this._elements.status.innerHTML = `<div>${escapeHtml(message)}<small>${escapeHtml(detail || `Card ${VERSION}`)}</small></div>`;
  }

  _hideStatus() {
    if (this._elements?.status) this._elements.status.hidden = true;
  }

  async _initialise() {
    if (this._map || !this._elements?.map) return;

    try {
      this._setStatus('Loading local CSP map engine…');
      const maplibregl = await loadMapLibre();
      const workerUrl = new URL(`./maplibre-csp-worker-proxy.js?v=${VERSION}`, import.meta.url).href;
      maplibregl.setWorkerUrl(workerUrl);
      maplibregl.setWorkerCount?.(1);

      const region = getRegion(this._config, this._hass);
      this._elements.region.textContent = region.label;
      this._setStatus('Starting CSP-safe map canvas…', `Worker: local HACS file · Card ${VERSION}`);

      this._startupTimer = window.setTimeout(() => {
        if (!this._mapReady) this._setStatus('Map engine did not finish starting.', 'Check browser console for worker, WebGL or Content Security Policy errors.');
      }, 15000);

      this._maplibregl = maplibregl;
      this._map = new maplibregl.Map({
        container: this._elements.map,
        style: EMPTY_STYLE,
        center: region.centre,
        zoom: 9,
        pitch: this._config.map.overview_pitch,
        bearing: this._config.map.overview_bearing,
        attributionControl: true,
        maplibreLogo: false,
      });

      this._map.once('load', () => this._onLocalMapReady(region));
      this._map.on('mousedown', () => this._stopCamera());
      this._map.on('error', (event) => {
        const error = event?.error ?? event;
        console.warn(`[${TAG}] MapLibre error`, error);
        if (!this._mapReady) this._setStatus('MapLibre reported an error.', error?.message || String(error));
      });
    } catch (error) {
      console.error(`[${TAG}] Startup failure`, error);
      this._setStatus('Emergency map failed to start.', error.message);
    }
  }

  _onLocalMapReady(region) {
    clearTimeout(this._startupTimer);
    this._mapReady = true;
    this._hideStatus();

    const homeElement = document.createElement('div');
    homeElement.className = 'home-marker';
    homeElement.textContent = '⌂';
    this._homeMarker = new this._maplibregl.Marker({ element: homeElement })
      .setLngLat([numberValue(this._hass?.config?.longitude) ?? region.centre[0], numberValue(this._hass?.config?.latitude) ?? region.centre[1]])
      .addTo(this._map);

    this._showOverview(false);
    this._updateIncidents();
    this._loadBasemap();
  }

  async _loadBasemap() {
    const requested = clean(this._config.map.style_url);
    const styles = [...new Set([requested, ...BASEMAPS].filter(Boolean))];
    for (const styleUrl of styles) {
      try {
        await this._tryStyle(styleUrl);
        this._enableTerrain();
        return;
      } catch (error) {
        console.warn(`[${TAG}] Basemap failed: ${styleUrl}`, error);
      }
    }
    console.warn(`[${TAG}] All remote basemaps failed. Incident markers remain available.`);
  }

  _tryStyle(styleUrl) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (success, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this._map.off('style.load', onLoad);
        this._map.off('error', onError);
        success ? resolve() : reject(error);
      };
      const timeout = window.setTimeout(() => finish(false, new Error('Basemap timed out')), 12000);
      const onLoad = () => finish(true);
      const onError = (event) => {
        const error = event?.error ?? event;
        if (/style|sprite|glyph|source/i.test(error?.message || '')) finish(false, error);
      };
      this._map.once('style.load', onLoad);
      this._map.on('error', onError);
      try { this._map.setStyle(styleUrl, { diff: false }); }
      catch (error) { finish(false, error); }
    });
  }

  _enableTerrain() {
    if (!this._config.map.terrain || !this._mapReady) return;
    try {
      if (!this._map.getSource('emergency-terrain')) {
        this._map.addSource('emergency-terrain', { type:'raster-dem', tiles:[this._config.map.terrain_url], tileSize:256, encoding:'terrarium' });
      }
      this._map.setTerrain({ source:'emergency-terrain', exaggeration:numberValue(this._config.map.terrain_exaggeration) ?? 1.25 });
    } catch (error) {
      console.warn(`[${TAG}] Terrain unavailable`, error);
    }
  }

  _collectIncidents() {
    if (this._config.demo_mode) {
      const region = getRegion(this._config, this._hass);
      const samples = [['Bushfire','severe'],['Flood','moderate'],['Storm Warning','extreme'],['Traffic Incident','minor']];
      return samples.map(([type, level], index) => ({
        id:`demo-${index}`, type, level,
        headline:`Demonstration ${type.toLowerCase()} incident`,
        point:destination(region.centre, 35 + index * 82, 8 + index * 5),
        distance:8 + index * 5,
        direction:'inside the selected region',
        status:'Demo data',
      }));
    }

    const entityIds = this._config.entities;
    const nearby = this._hass?.states?.[entityIds.incidents];
    const base = Array.isArray(nearby?.attributes?.incidents) ? nearby.attributes.incidents : [];
    const generatedIds = Array.isArray(nearby?.attributes?.entity_ids) ? nearby.attributes.entity_ids : [];

    const incidents = base.map((raw, index) => {
      const slug = String(raw.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const generatedId = generatedIds.find((id) => slug && String(id).endsWith(slug)) ?? generatedIds[index];
      const generated = generatedId ? this._hass?.states?.[generatedId] : null;
      const attributes = generated?.attributes ?? {};
      const type = clean(attributes.event_type ?? raw.event_type ?? 'Emergency incident');
      if (type.toLowerCase() === 'other non-urgent alerts') return null;
      return {
        id:String(raw.id ?? generatedId ?? index),
        type,
        level:normaliseLevel(attributes.alert_level ?? raw.alert_level),
        headline:clean(attributes.headline ?? attributes.friendly_name ?? raw.headline ?? 'Incident details updating'),
        point:extractPoint(attributes) ?? extractPoint(raw),
        distance:numberValue(generated?.state ?? raw.distance_km),
        direction:clean(attributes.direction ?? raw.direction),
        status:clean(attributes.status),
      };
    }).filter((incident) => incident?.point);

    return incidents.sort((left, right) => LEVELS[right.level].rank - LEVELS[left.level].rank || (left.distance ?? 99999) - (right.distance ?? 99999));
  }

  _updateIncidents() {
    if (!this._hass && !this._config.demo_mode) return;
    const incidents = this._collectIncidents();
    const previous = this._previousLevels;
    this._incidents = incidents;
    this._previousLevels = new Map(incidents.map((incident) => [incident.id, incident.level]));
    if (this._mapReady) this._drawMarkers();
    const importantChange = incidents.find((incident) => !previous.has(incident.id) || LEVELS[incident.level].rank > LEVELS[previous.get(incident.id) ?? 'none'].rank);
    if (importantChange && this._mapReady) this._focusIncident(importantChange, true);
  }

  _drawMarkers() {
    const activeIds = new Set(this._incidents.map((incident) => incident.id));
    for (const incident of this._incidents) {
      let item = this._markers.get(incident.id);
      if (!item) {
        const element = document.createElement('button');
        element.className = 'marker';
        element.innerHTML = `<span>${incidentIcon(incident.type)}</span>`;
        element.addEventListener('click', () => this._focusIncident(incident, true));
        item = { element, marker:new this._maplibregl.Marker({ element, anchor:'bottom' }).setLngLat(incident.point).addTo(this._map) };
        this._markers.set(incident.id, item);
      }
      item.marker.setLngLat(incident.point);
      item.element.style.setProperty('--marker-colour', LEVELS[incident.level].colour);
    }
    for (const [id, item] of this._markers) {
      if (!activeIds.has(id)) { item.marker.remove(); this._markers.delete(id); }
    }
    this._elements.clear.hidden = this._incidents.length > 0;
    if (!this._incidents.length) this._elements.panel.hidden = true;
  }

  _focusIncident(incident, animate) {
    if (!incident || !this._mapReady) return;
    this._stopCamera();
    this._selectedId = incident.id;
    const severity = LEVELS[incident.level];
    this._elements.panel.hidden = false;
    this._elements.panel.style.setProperty('--severity', severity.colour);
    this._elements.badge.textContent = incidentIcon(incident.type);
    this._elements.severity.textContent = severity.label;
    this._elements.type.textContent = incident.type.toUpperCase();
    this._elements.headline.textContent = incident.headline;
    this._elements.meta.textContent = [Number.isFinite(incident.distance) ? `${incident.distance.toFixed(1)} km` : '', incident.direction, incident.status].filter(Boolean).join(' · ');

    const token = ++this._animationToken;
    this._map.flyTo({ center:incident.point, zoom:numberValue(this._config.map.incident_zoom) ?? 14.2, pitch:numberValue(this._config.map.incident_pitch) ?? 62, bearing:this._map.getBearing(), duration:animate ? 3400 : 0, essential:true });
    this._map.once('moveend', () => {
      if (token !== this._animationToken) return;
      if (this._config.camera.orbit) this._orbitIncident(incident, token);
      else this._scheduleReturn(token);
    });
  }

  _orbitIncident(incident, token) {
    const started = performance.now();
    const duration = Math.max(6000, numberValue(this._config.camera.orbit_duration) ?? 22000);
    const initialBearing = this._map.getBearing();
    const frame = (now) => {
      if (token !== this._animationToken) return;
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      this._map.jumpTo({ center:incident.point, bearing:initialBearing + 360 * eased, pitch:numberValue(this._config.map.incident_pitch) ?? 62 });
      if (progress < 1) this._orbitFrame = requestAnimationFrame(frame);
      else this._scheduleReturn(token);
    };
    this._orbitFrame = requestAnimationFrame(frame);
  }

  _scheduleReturn(token) {
    if (!this._config.camera.auto_return) return;
    this._returnTimer = window.setTimeout(() => {
      if (token === this._animationToken) this._showOverview(true);
    }, numberValue(this._config.camera.auto_return_delay) ?? 30000);
  }

  _showOverview(animate) {
    if (!this._mapReady) return;
    this._stopCamera();
    this._selectedId = null;
    this._elements.panel.hidden = true;
    const region = getRegion(this._config, this._hass);
    let bounds = region.bounds;
    if (!bounds) bounds = [destination(region.centre, 225, region.radius), destination(region.centre, 45, region.radius)];
    this._map.fitBounds(bounds, { padding:60, duration:animate ? 1800 : 0, pitch:numberValue(this._config.map.overview_pitch) ?? 48, bearing:numberValue(this._config.map.overview_bearing) ?? -18, maxZoom:12, essential:true });
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
  window.customCards.push({ type:TAG, name:'Emergency Orbit Map Card', description:'Live 3D emergency map using a CSP-safe worker and orbit camera.' });
}
console.info('%c EMERGENCY ORBIT MAP CARD %c v0.1.3-alpha ','color:white;background:#1976d2;padding:3px','color:#dbeafe;background:#0f172a;padding:3px');
