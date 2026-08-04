/* Emergency Orbit 3D Card NSW statewide extension v0.1.0-alpha.2 */
(() => {
  'use strict';

  const core = window.__EOM3D || {};
  const {
    TAG,
    LEVELS,
    EMPTY_FC,
    numberValue,
    clean,
    escapeHtml,
    normaliseLevel,
    slugify,
    haversine,
    extractPoint,
    extractGeometry,
    geometryBounds,
  } = core;
  const Card = window.__EOM3D_CARD_CLASS;

  if (!TAG || !Card) throw new Error('Emergency Orbit 3D statewide extension loaded before the card base.');

  const STATEWIDE_DEFAULTS = Object.freeze({
    enabled: true,
    include_on_load: false,
    label: 'NSW-wide incidents',
    description: 'Include ABC Emergency incidents across New South Wales',
    entity_prefixes: [
      'geo_location.abc_emergency_new_south_wales_',
      'geo_location.abc_emergency_nsw_',
    ],
    exclude_prefixes: [
      'geo_location.abc_emergency_home_',
    ],
    state_aliases: [
      'new_south_wales',
      'new south wales',
      'nsw',
    ],
    total_entity: 'sensor.abc_emergency_new_south_wales_total_incidents',
    highest_level_entity: 'sensor.abc_emergency_new_south_wales_highest_alert_level',
    auto_focus: true,
    auto_focus_level: 'extreme',
    fit_overview: true,
    fit_on_toggle: true,
    max_overview_zoom: 10.8,
  });

  const mergeStatewideConfig = (config = {}) => ({
    ...config,
    statewide: {
      ...STATEWIDE_DEFAULTS,
      ...(config.statewide || {}),
    },
  });

  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function setConfigWithStatewide(config) {
    const next = mergeStatewideConfig(config);
    this._statewideEnabled = next.statewide.enabled !== false && next.statewide.include_on_load === true;
    return originalSetConfig.call(this, next);
  };

  const installControl = (card) => {
    if (!card?._els?.orbitSwitch || card.shadowRoot.querySelector('.statewide-switch')) return;

    const style = card.shadowRoot.querySelector('style');
    if (style) style.textContent += `
      .statewide-row{margin-bottom:2px}
      .incident-button.statewide{border-style:dashed;background:rgba(75,140,255,.025)}
      .incident-button.statewide:after{content:"NSW";position:absolute;top:5px;right:7px;color:#78aaff;font-size:7px;font-weight:900;letter-spacing:.11em;opacity:.75}
      .incident-button.statewide .incident-location{padding-right:26px}
      .marker.statewide{opacity:.86}
      .marker.statewide .marker-pin{width:33px;height:33px;border-style:dashed;box-shadow:0 0 0 5px color-mix(in srgb,var(--marker) 18%,transparent),0 8px 20px #0009}
      .marker.statewide .marker-pin span{font-size:14px}
    `;

    const row = document.createElement('label');
    row.className = 'switch-row statewide-row';
    row.innerHTML = `
      <span class="switch-copy">
        <strong>${escapeHtml(card._config.statewide.label)}</strong>
        <small>${escapeHtml(card._config.statewide.description)}</small>
      </span>
      <span class="switch">
        <input class="statewide-switch" type="checkbox" ${card._statewideEnabled ? 'checked' : ''}>
        <span class="track"></span>
      </span>`;

    const orbitRow = card._els.orbitSwitch.closest('.switch-row');
    orbitRow?.parentNode?.insertBefore(row, orbitRow);
    card._els.statewideSwitch = row.querySelector('.statewide-switch');

    card._els.statewideSwitch.addEventListener('change', () => {
      card._statewideEnabled = card._els.statewideSwitch.checked;
      card._suppressNextFocus = true;
      card._firstFocusDone = true;
      card._updateFromHass();

      if (card._config.statewide.fit_on_toggle !== false) {
        window.setTimeout(() => card._showOverview(true), 0);
      }
    });
  };

  const originalRender = window.__EOM3D_RENDER;
  window.__EOM3D_RENDER = function renderWithStatewideControl() {
    originalRender.call(this);
    installControl(this);
  };

  const originalCollectIncidents = Card.prototype._collectIncidents;
  const originalRenderIncidentList = Card.prototype._renderIncidentList;
  const originalSyncMapData = Card.prototype._syncMapData;
  const originalShowOverview = Card.prototype._showOverview;

  Object.assign(Card.prototype, {
    _statewideIdentityText(state) {
      const attributes = state?.attributes || {};
      return [
        state?.entity_id,
        attributes.source,
        attributes.provider,
        attributes.integration,
        attributes.attribution,
        attributes.state,
        attributes.region,
        attributes.area,
        attributes.device_name,
      ].filter(Boolean).join(' ').toLowerCase();
    },

    _matchesStatewideEntity(state) {
      if (!state?.entity_id?.startsWith('geo_location.')) return false;
      const config = this._config.statewide || STATEWIDE_DEFAULTS;
      const id = state.entity_id.toLowerCase();
      const identity = this._statewideIdentityText(state);
      const prefixes = (config.entity_prefixes || []).map((value) => String(value).toLowerCase());
      const excluded = (config.exclude_prefixes || []).map((value) => String(value).toLowerCase());
      if (excluded.some((prefix) => id.startsWith(prefix))) return false;

      const directPrefix = prefixes.some((prefix) => id.startsWith(prefix));
      const abcEmergency = id.includes('abc_emergency') || identity.includes('abc emergency');
      const aliases = (config.state_aliases || []).map((value) => String(value).toLowerCase());
      const stateMatch = aliases.some((alias) => id.includes(alias) || identity.includes(alias));
      return directPrefix || (abcEmergency && stateMatch);
    },

    _collectStatewideIncidents() {
      if (!this._hass || !this._statewideEnabled || this._config.statewide?.enabled === false) return [];

      return Object.values(this._hass.states || {})
        .filter((state) => this._matchesStatewideEntity(state))
        .map((state) => {
          const attributes = state.attributes || {};
          const point = extractPoint(attributes);
          if (!point) return null;

          const type = clean(
            attributes.event_type ??
            attributes.incident_type ??
            attributes.category ??
            attributes.event ??
            attributes.type ??
            'Emergency incident'
          );
          if (this._config.display.hide_non_urgent && type.toLowerCase() === 'other non-urgent alerts') return null;

          const headline = clean(
            attributes.headline ??
            attributes.title ??
            attributes.name ??
            attributes.friendly_name ??
            type
          );

          return {
            id: state.entity_id,
            sourceId: clean(attributes.id ?? attributes.event_id ?? attributes.guid ?? attributes.identifier),
            scope: 'statewide',
            type,
            level: normaliseLevel(
              attributes.alert_level ??
              attributes.warning_level ??
              attributes.severity ??
              attributes.alertLevel
            ),
            alertText: clean(attributes.alert_text ?? attributes.description ?? attributes.message),
            headline,
            point,
            distance: numberValue(state.state) ?? haversine(this._homePoint(), point),
            direction: clean(attributes.direction),
            status: clean(attributes.status ?? attributes.phase),
            location: clean(
              attributes.location_name ??
              attributes.locality ??
              attributes.place ??
              attributes.area_name ??
              attributes.area ??
              attributes.location
            ),
            source: clean(attributes.source ?? attributes.provider ?? 'ABC Emergency NSW'),
            updated: clean(attributes.updated ?? attributes.last_updated ?? attributes.published),
            geometry: extractGeometry(attributes),
          };
        })
        .filter(Boolean)
        .sort((left, right) => LEVELS[right.level].rank - LEVELS[left.level].rank || (left.distance ?? 99999) - (right.distance ?? 99999));
    },

    _sameIncident(left, right) {
      if (!left || !right) return false;
      if (left.id === right.id) return true;
      if (left.sourceId && right.sourceId && left.sourceId === right.sourceId) return true;
      if (!left.point || !right.point || haversine(left.point, right.point) > 0.35) return false;

      const leftHeadline = slugify(left.headline);
      const rightHeadline = slugify(right.headline);
      const sameHeadline = leftHeadline && rightHeadline && (leftHeadline === rightHeadline || leftHeadline.includes(rightHeadline) || rightHeadline.includes(leftHeadline));
      return sameHeadline || slugify(left.type) === slugify(right.type);
    },

    _collectIncidents() {
      const local = originalCollectIncidents.call(this).map((incident) => ({ ...incident, scope: 'local' }));
      if (this._config.demo_mode || !this._statewideEnabled) return local;

      const statewide = this._collectStatewideIncidents().filter(
        (incident) => !local.some((localIncident) => this._sameIncident(localIncident, incident))
      );
      return [...local, ...statewide];
    },

    _updateFromHass() {
      if (!this._hass && !this._config.demo_mode) return;
      const incidents = this._collectIncidents();
      const previous = this._previousLevels;
      this._incidents = incidents;
      this._previousLevels = new Map(incidents.map((incident) => [incident.id, incident.level]));

      if (this._selectedId && !incidents.some((incident) => incident.id === this._selectedId)) {
        this._selectedId = null;
        if (this._els?.panel) this._els.panel.hidden = true;
        this._map?.getSource('eom3d-incident')?.setData(EMPTY_FC);
        this._map?.getSource('eom3d-home-link')?.setData(EMPTY_FC);
      }

      this._renderIncidentList();
      this._updateHomeMarker();
      if (this._mapReady) this._syncMapData();

      const statewideThreshold = normaliseLevel(this._config.statewide?.auto_focus_level || 'extreme');
      const important = incidents.find((incident) => {
        const isNew = !previous.has(incident.id);
        const escalated = this._config.camera.refocus_on_escalation && LEVELS[incident.level].rank > LEVELS[previous.get(incident.id) ?? 'none'].rank;
        if (!isNew && !escalated) return false;
        if (incident.scope !== 'statewide') return true;
        return this._config.statewide?.auto_focus !== false && LEVELS[incident.level].rank >= LEVELS[statewideThreshold].rank;
      });

      if (this._mapReady && important && !this._suppressNextFocus) this._focusIncident(important, true);
      this._suppressNextFocus = false;
    },

    _renderIncidentList() {
      originalRenderIncidentList.call(this);
      if (!this._els) return;

      const localCount = this._incidents.filter((incident) => incident.scope !== 'statewide').length;
      const statewideCount = this._incidents.filter((incident) => incident.scope === 'statewide').length;
      const feedTotal = numberValue(this._hass?.states?.[this._config.statewide?.total_entity]?.state);

      if (this._statewideEnabled) {
        const feedSuffix = Number.isFinite(feedTotal) && feedTotal !== statewideCount ? ` · ${feedTotal} FEED` : '';
        this._els.total.textContent = `${localCount} LOCAL · ${statewideCount} NSW${feedSuffix}`;
      } else {
        this._els.total.textContent = `${localCount} LOCAL`;
      }

      this._els.list.querySelectorAll('[data-id]').forEach((button) => {
        const incident = this._incidents.find((item) => item.id === button.dataset.id);
        if (!incident) return;
        button.classList.toggle('statewide', incident.scope === 'statewide');
        const location = button.querySelector('.incident-location');
        if (location) {
          const prefix = incident.scope === 'statewide' ? 'NSW' : 'LOCAL';
          const text = incident.location || incident.headline;
          location.textContent = `${prefix} · ${text}`;
        }
      });
    },

    _syncMapData() {
      originalSyncMapData.call(this);
      for (const incident of this._incidents) {
        const entry = this._markers.get(incident.id);
        entry?.element?.classList.toggle('statewide', incident.scope === 'statewide');
      }
    },

    _showOverview(animate) {
      if (!this._statewideEnabled || this._config.statewide?.fit_overview === false || !this._mapReady) {
        return originalShowOverview.call(this, animate);
      }

      this._stopMotion(false);
      this._selectedId = null;
      this._renderIncidentList();
      for (const entry of this._markers.values()) entry.element.classList.remove('selected');
      this._els.panel.hidden = true;
      this._map.getSource('eom3d-incident')?.setData(EMPTY_FC);
      this._map.getSource('eom3d-home-link')?.setData(EMPTY_FC);

      const region = this._region();
      const baseBounds = region.bounds || geometryBounds(region.feature);
      const bounds = { ...baseBounds };
      for (const incident of this._incidents) {
        if (!incident.point) continue;
        bounds.west = Math.min(bounds.west, incident.point[0]);
        bounds.east = Math.max(bounds.east, incident.point[0]);
        bounds.south = Math.min(bounds.south, incident.point[1]);
        bounds.north = Math.max(bounds.north, incident.point[1]);
      }

      const token = ++this._motionToken;
      this._setMotion('RETURNING');
      this._map.once('moveend', () => {
        if (token !== this._motionToken) return;
        this._setMotion('OVERVIEW');
        const stateCount = this._incidents.filter((incident) => incident.scope === 'statewide').length;
        this._setSystem(stateCount ? `${stateCount} NSW INCIDENT${stateCount === 1 ? '' : 'S'}` : 'LOCAL OVERVIEW', stateCount > 0);
      });

      const camera = this._map.cameraForBounds(
        [[bounds.west, bounds.south], [bounds.east, bounds.north]],
        {
          padding: { top: 115, right: 90, bottom: 105, left: 90 },
          maxZoom: numberValue(this._config.statewide?.max_overview_zoom) ?? 10.8,
        }
      );

      this._map.flyTo({
        center: camera?.center || region.center,
        zoom: camera?.zoom ?? this._overviewZoom(region),
        pitch: numberValue(this._config.map.overview_pitch) ?? 50,
        bearing: numberValue(this._config.map.overview_bearing) ?? -18,
        duration: animate ? 3200 : 0,
        curve: 1.25,
        essential: true,
      });
    },
  });

  queueMicrotask(() => {
    document.querySelectorAll(TAG).forEach((card) => {
      if (!card.shadowRoot?.querySelector('.statewide-switch')) {
        card._render();
        if (card.isConnected) card._ensureMap();
      }
    });
  });

  console.info('%c EMERGENCY ORBIT 3D %c NSW statewide extension alpha.2 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
})();
