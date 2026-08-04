/* Emergency Orbit 3D Card data adapter v0.1.0-alpha.1 */
(() => {
  'use strict';
  const { numberValue, clean, escapeHtml, normaliseLevel, iconFor, slugify, destination, haversine, circleFeature, lineFeature, fc, extractPoint, extractGeometry, geometryBounds } = window.__EOM3D || {};
  const { LEVELS, EMPTY_FC } = window.__EOM3D || {};

  const Card = window.__EOM3D_CARD_CLASS;
  if (!Card) throw new Error('Emergency Orbit 3D card base was not loaded.');
  Object.assign(Card.prototype, {
_region() {
      const home = this._homePoint();
      const region = this._config.region || {};
      if (region.mode === 'bounds') {
        const west = numberValue(region.west); const east = numberValue(region.east); const south = numberValue(region.south); const north = numberValue(region.north);
        if ([west, east, south, north].every(Number.isFinite)) return { label: region.label || 'Defined region', center: [(west + east) / 2, (south + north) / 2], bounds: { west, east, south, north }, feature: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } } };
      }
      const center = region.mode === 'custom' ? [numberValue(region.longitude) ?? home[0], numberValue(region.latitude) ?? home[1]] : home;
      const radius = numberValue(region.radius_km) ?? 40;
      const feature = circleFeature(center, radius);
      return { label: region.label || 'Home region', center, radius, feature, bounds: geometryBounds(feature) };
    },

_homePoint() {
      return [numberValue(this._config.home.longitude) ?? numberValue(this._hass?.config?.longitude) ?? 150.738, numberValue(this._config.home.latitude) ?? numberValue(this._hass?.config?.latitude) ?? -34.028];
    },

_overviewZoom(region) {
      const radius = region.radius ?? Math.max(haversine(region.center, [region.bounds.east, region.center[1]]), 5);
      return Math.max(5.5, Math.min(13, 12.2 - Math.log2(Math.max(radius, 1) / 8)));
    },

_installHomeMarker() {
      if (!this._config.display.show_home || this._homeMarker) return;
      const element = document.createElement('div');
      element.className = 'home-marker';
      element.innerHTML = '<span class="home-ring"></span><span class="home-ring"></span><span class="home-core"></span>';
      this._homeMarker = new window.maplibregl.Marker({ element, anchor: 'center' }).setLngLat(this._homePoint()).addTo(this._map);
      this._updateHomeMarker();
    },

_updateHomeMarker() {
      if (!this._homeMarker) return;
      const inside = this._hass?.states?.[this._config.entities.inside_polygon]?.state === 'on';
      this._homeMarker.getElement().classList.toggle('danger', inside);
      this._homeMarker.setLngLat(this._homePoint());
    },

_collectIncidents() {
      if (this._config.demo_mode) {
        const region = this._region();
        const samples = [
          ['Camden grass fire', 'Bushfire', 'severe', 305, 9],
          ['Flooding near the Nepean River', 'Flood', 'moderate', 178, 13],
          ['Severe storm moving across Macarthur', 'Severe Thunderstorm', 'extreme', 45, 7],
          ['Emergency services responding', 'Motor Vehicle Incident', 'minor', 95, 16],
        ];
        return samples.map(([headline, type, level, bearing, distance], index) => {
          const point = destination(region.center, bearing, distance);
          return { id: `demo-${index}`, headline, type, level, point, distance: haversine(this._homePoint(), point), direction: 'inside the selected region', status: 'Demo data', location: region.label, geometry: index === 2 ? circleFeature(point, 2.8) : null, updated: new Date().toISOString() };
        });
      }

      const nearby = this._hass?.states?.[this._config.entities.incidents];
      const rawItems = Array.isArray(nearby?.attributes?.incidents) ? nearby.attributes.incidents : [];
      const generatedIds = Array.isArray(nearby?.attributes?.entity_ids) ? nearby.attributes.entity_ids : [];
      const items = rawItems.map((raw, index) => {
        const slug = slugify(raw?.id);
        const generatedId = generatedIds.find((entityId) => slug && slugify(entityId).endsWith(slug)) ?? generatedIds[index];
        const generated = generatedId ? this._hass?.states?.[generatedId] : null;
        const attributes = generated?.attributes ?? {};
        const type = clean(attributes.event_type ?? raw?.event_type ?? 'Emergency incident');
        if (this._config.display.hide_non_urgent && type.toLowerCase() === 'other non-urgent alerts') return null;
        const point = extractPoint(attributes) ?? extractPoint(raw);
        if (!point) return null;
        const geometry = extractGeometry(attributes, raw);
        return {
          id: String(raw?.id ?? generatedId ?? `${slugify(type)}-${index}`),
          generatedId,
          type,
          level: normaliseLevel(attributes.alert_level ?? raw?.alert_level),
          alertText: clean(attributes.alert_text ?? raw?.alert_text),
          headline: clean(attributes.headline ?? raw?.headline ?? attributes.friendly_name ?? 'Incident details updating'),
          point,
          distance: numberValue(generated?.state ?? raw?.distance_km) ?? haversine(this._homePoint(), point),
          direction: clean(attributes.direction ?? raw?.direction),
          status: clean(attributes.status ?? raw?.status),
          location: clean(attributes.location_name ?? attributes.location ?? raw?.location_name ?? raw?.location),
          source: clean(attributes.source ?? raw?.source),
          updated: clean(attributes.updated ?? attributes.last_updated ?? raw?.updated),
          geometry,
        };
      }).filter(Boolean);

      if (!items.length) {
        const nearest = this._hass?.states?.[this._config.entities.nearest];
        const attributes = nearest?.attributes ?? {};
        const point = extractPoint(attributes);
        if (nearest && point) items.push({ id: nearest.entity_id, type: clean(attributes.event_type ?? 'Emergency incident'), level: normaliseLevel(attributes.alert_level), headline: clean(attributes.headline ?? attributes.friendly_name ?? 'Incident details updating'), point, distance: numberValue(nearest.state) ?? haversine(this._homePoint(), point), direction: clean(attributes.direction), status: clean(attributes.status), location: clean(attributes.location_name ?? attributes.location), source: clean(attributes.source), updated: clean(attributes.updated ?? attributes.last_updated), geometry: extractGeometry(attributes) });
      }
      return items.sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || (a.distance ?? 99999) - (b.distance ?? 99999));
    },

_updateFromHass() {
      if (!this._hass && !this._config.demo_mode) return;
      const incidents = this._collectIncidents();
      const previous = this._previousLevels;
      this._incidents = incidents;
      this._previousLevels = new Map(incidents.map((incident) => [incident.id, incident.level]));
      this._renderIncidentList();
      this._updateHomeMarker();
      if (this._mapReady) this._syncMapData();
      const important = incidents.find((incident) => !previous.has(incident.id) || (this._config.camera.refocus_on_escalation && LEVELS[incident.level].rank > LEVELS[previous.get(incident.id) ?? 'none'].rank));
      if (this._mapReady && important && !this._suppressNextFocus) this._focusIncident(important, true);
      this._suppressNextFocus = false;
    },

_renderIncidentList() {
      if (!this._els) return;
      this._els.total.textContent = `${this._incidents.length} ${this._incidents.length === 1 ? 'INCIDENT' : 'INCIDENTS'}`;
      this._els.list.innerHTML = this._incidents.map((incident) => {
        const severity = LEVELS[incident.level];
        const selected = incident.id === this._selectedId ? ' selected' : '';
        return `<button class="incident-button${selected}" data-id="${escapeHtml(incident.id)}" style="--button:${severity.colour}"><span class="incident-icon">${iconFor(incident.type)}</span><span class="incident-copy"><span class="incident-type">${escapeHtml(incident.type)}</span><span class="incident-location">${escapeHtml(incident.location || incident.headline)}</span></span><span class="incident-level">${severity.short}</span></button>`;
      }).join('');
      this._els.list.querySelectorAll('[data-id]').forEach((button) => button.addEventListener('click', () => {
        const incident = this._incidents.find((item) => item.id === button.dataset.id);
        if (incident) this._focusIncident(incident, true);
      }));
    },

_syncMapData() {
      if (!this._mapReady || !this._layersReady) return;
      const region = this._region();
      this._map.getSource('eom3d-region')?.setData(fc([region.feature]));
      const activeIds = new Set(this._incidents.map((incident) => incident.id));
      for (const incident of this._incidents) {
        const severity = LEVELS[incident.level];
        let entry = this._markers.get(incident.id);
        if (!entry) {
          const element = document.createElement('div');
          element.className = 'marker';
          element.style.setProperty('--marker', severity.colour);
          element.innerHTML = `<div class="marker-pin"><span>${iconFor(incident.type)}</span></div>`;
          element.addEventListener('click', () => this._focusIncident(this._incidents.find((item) => item.id === incident.id) || incident, true));
          const marker = new window.maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(incident.point).addTo(this._map);
          entry = { marker, element };
          this._markers.set(incident.id, entry);
        }
        entry.marker.setLngLat(incident.point);
        entry.element.style.setProperty('--marker', severity.colour);
        entry.element.querySelector('span').textContent = iconFor(incident.type);
        entry.element.classList.toggle('selected', incident.id === this._selectedId);
      }
      for (const [id, entry] of this._markers) {
        if (!activeIds.has(id)) { entry.marker.remove(); this._markers.delete(id); }
      }
      this._els.clear.hidden = !this._config.display.show_clear_state || this._incidents.length > 0;
      if (!this._incidents.length) {
        this._selectedId = null;
        this._els.panel.hidden = true;
        this._map.getSource('eom3d-incident')?.setData(EMPTY_FC);
        this._map.getSource('eom3d-home-link')?.setData(EMPTY_FC);
        this._setSystem(this._terrainReady ? 'SYSTEM READY' : 'MAP READY');
      } else if (!this._firstFocusDone && this._config.camera.focus_on_load) {
        this._firstFocusDone = true;
        this._focusIncident(this._incidents[0], true);
      }
    }
  });

})();
