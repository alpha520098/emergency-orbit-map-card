/* Emergency Orbit 3D Card camera and registration v0.1.0-alpha.1 */
(() => {
  'use strict';
  const { TAG, VERSION, numberValue, LEVELS, EMPTY_FC, iconFor, circleFeature, lineFeature, fc, geometryBounds, boundsCenter } = window.__EOM3D || {};

  const Card = window.__EOM3D_CARD_CLASS;
  if (!Card) throw new Error('Emergency Orbit 3D card base was not loaded.');
  Object.assign(Card.prototype, {
_focusIncident(incident, animate) {
      if (!incident || !this._mapReady) return;
      this._stopMotion(false);
      this._selectedId = incident.id;
      this._renderIncidentList();
      for (const [id, entry] of this._markers) entry.element.classList.toggle('selected', id === incident.id);
      const severity = LEVELS[incident.level];
      this.style.setProperty('--eom3d-active', severity.colour);
      this._showPanel(incident);
      this._setSystem(severity.label, true);
      const geometry = incident.geometry || circleFeature(incident.point, 0.7);
      const decorated = this._decorateGeometry(geometry, severity.colour);
      this._map.getSource('eom3d-incident')?.setData(decorated);
      this._map.getSource('eom3d-home-link')?.setData(fc([{ ...lineFeature(this._homePoint(), incident.point), properties: { colour: severity.colour } }]));
      const bounds = geometryBounds(geometry);
      const targetCenter = bounds ? boundsCenter(bounds) : incident.point;
      let targetZoom = numberValue(this._config.map.incident_zoom) ?? 14.2;
      if (bounds) {
        const camera = this._map.cameraForBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: { top: 120, right: 90, bottom: 150, left: 90 }, maxZoom: numberValue(this._config.map.max_incident_zoom) ?? 15.8 });
        if (camera?.zoom != null) targetZoom = Math.min(camera.zoom, numberValue(this._config.map.max_incident_zoom) ?? 15.8);
      }
      const token = ++this._motionToken;
      this._setMotion('FLYING');
      const startOrbit = () => {
        this._map.off('moveend', startOrbit);
        clearTimeout(this._moveFallback);
        this._moveFallback = 0;
        if (token !== this._motionToken) return;
        if (this._els.orbitSwitch.checked) this._startOrbit(incident, targetCenter, targetZoom, token);
        else { this._setMotion('MONITORING'); this._scheduleReturn(token); }
      };
      this._map.once('moveend', startOrbit);
      this._map.flyTo({ center: targetCenter, zoom: targetZoom, pitch: numberValue(this._config.map.incident_pitch) ?? 62, bearing: -22, duration: animate ? numberValue(this._config.camera.fly_duration) ?? 3600 : 0, curve: 1.35, essential: true });
      this._moveFallback = window.setTimeout(startOrbit, Math.max(250, (animate ? numberValue(this._config.camera.fly_duration) ?? 3600 : 0) + 500));
    },

_decorateGeometry(geometryLike, colour) {
      if (geometryLike?.type === 'FeatureCollection') return { ...geometryLike, features: geometryLike.features.map((feature) => ({ ...feature, properties: { ...(feature.properties || {}), colour } })) };
      if (geometryLike?.type === 'Feature') return fc([{ ...geometryLike, properties: { ...(geometryLike.properties || {}), colour } }]);
      return fc([{ type: 'Feature', properties: { colour }, geometry: geometryLike }]);
    },

_startOrbit(incident, center, zoom, token) {
      const duration = Math.max(8000, numberValue(this._config.camera.orbit_duration) ?? 22000);
      const turns = Math.max(0.25, numberValue(this._config.camera.orbit_turns) ?? 1);
      const startBearing = this._map.getBearing();
      const start = performance.now();
      this._setMotion('ORBITING');
      const tick = (now) => {
        if (token !== this._motionToken) return;
        const raw = Math.min(1, (now - start) / duration);
        const eased = raw < 0.5 ? 2 * raw * raw : 1 - ((-2 * raw + 2) ** 2) / 2;
        this._map.jumpTo({ center, zoom, pitch: numberValue(this._config.map.incident_pitch) ?? 62, bearing: startBearing + 360 * turns * eased });
        if (raw < 1) this._orbitFrame = requestAnimationFrame(tick);
        else { this._orbitFrame = 0; this._setMotion('MONITORING'); this._scheduleReturn(token); }
      };
      this._orbitFrame = requestAnimationFrame(tick);
    },

_scheduleReturn(token) {
      if (!this._els.returnSwitch.checked) return;
      this._returnTimer = window.setTimeout(() => { if (token === this._motionToken) this._showOverview(true); }, numberValue(this._config.camera.auto_return_delay) ?? 4500);
    },

_showOverview(animate) {
      if (!this._mapReady) return;
      this._stopMotion(false);
      this._selectedId = null;
      this._renderIncidentList();
      for (const entry of this._markers.values()) entry.element.classList.remove('selected');
      this._els.panel.hidden = true;
      this._map.getSource('eom3d-incident')?.setData(EMPTY_FC);
      this._map.getSource('eom3d-home-link')?.setData(EMPTY_FC);
      const region = this._region();
      const bounds = region.bounds || geometryBounds(region.feature);
      const token = ++this._motionToken;
      this._setMotion('RETURNING');
      this._map.once('moveend', () => { if (token === this._motionToken) { this._setMotion('OVERVIEW'); this._setSystem(this._incidents.length ? `${this._incidents.length} INCIDENT${this._incidents.length === 1 ? '' : 'S'}` : this._terrainReady ? 'SYSTEM READY' : 'MAP READY', this._incidents.length > 0); } });
      const camera = this._map.cameraForBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: { top: 110, right: 80, bottom: 95, left: 80 }, maxZoom: 12.5 });
      this._map.flyTo({ center: camera?.center || region.center, zoom: camera?.zoom ?? this._overviewZoom(region), pitch: numberValue(this._config.map.overview_pitch) ?? 50, bearing: numberValue(this._config.map.overview_bearing) ?? -18, duration: animate ? 3200 : 0, curve: 1.25, essential: true });
    },

_showPanel(incident) {
      if (!this._config.display.show_incident_panel) return;
      const severity = LEVELS[incident.level];
      this._els.panel.hidden = false;
      this._els.bigIcon.textContent = iconFor(incident.type);
      this._els.severity.textContent = incident.alertText || severity.label;
      this._els.kind.textContent = incident.type.toUpperCase();
      this._els.headline.textContent = incident.headline;
      this._els.details.textContent = [incident.location, Number.isFinite(incident.distance) ? `${incident.distance < 10 ? incident.distance.toFixed(1) : Math.round(incident.distance)} km from home` : '', incident.direction, incident.status].filter(Boolean).join(' · ');
    },

_handleAction(action) {
      if (action === 'toggle-panel') {
        this._panelOpen = !this._panelOpen;
        this._els.controls.classList.toggle('closed', !this._panelOpen);
        return;
      }
      if (action === 'overview') { this._showOverview(true); return; }
      if (!this._incidents.length) return;
      if (action === 'orbit') {
        this._focusIncident(this._incidents.find((item) => item.id === this._selectedId) || this._incidents[0], true);
        return;
      }
      const current = Math.max(0, this._incidents.findIndex((item) => item.id === this._selectedId));
      const offset = action === 'previous' ? -1 : 1;
      this._focusIncident(this._incidents[(current + offset + this._incidents.length) % this._incidents.length], true);
    },

_setSystem(text, active = false) {
      if (!this._els) return;
      this._els.systemText.textContent = text;
      this._els.system.classList.toggle('active', active);
    },

_setMotion(text) {
      if (!this._els) return;
      this._els.motion.textContent = text;
      this._els.cameraMode.textContent = text;
    },

_updateReadout() {
      if (!this._map || !this._els) return;
      this._els.pitch.textContent = `${Math.round(this._map.getPitch())}°`;
      this._els.bearing.textContent = `${Math.round((this._map.getBearing() % 360 + 360) % 360)}°`;
      this._els.zoom.textContent = this._map.getZoom().toFixed(1);
    },

_stopMotion(stopMap = true) {
      this._motionToken += 1;
      cancelAnimationFrame(this._orbitFrame);
      clearTimeout(this._returnTimer);
      clearTimeout(this._moveFallback);
      this._orbitFrame = 0; this._returnTimer = 0; this._moveFallback = 0;
      if (stopMap) this._map?.stop();
      if (this._els && !this._els.panel.hidden) this._setMotion('MANUAL CONTROL');
    },

_showError(error) {
      this._debug('Fatal map error', error);
      if (!this._els) return;
      this._els.loading.hidden = true;
      this._els.error.hidden = false;
      this._els.errorMessage.textContent = error?.message || String(error);
    },

_destroyMap() {
      this._stopMotion(false);
      for (const entry of this._markers.values()) entry.marker.remove();
      this._markers.clear();
      this._homeMarker?.remove();
      this._homeMarker = null;
      try { this._map?.remove(); } catch (_) {}
      this._map = null;
      this._mapReady = false;
      this._layersReady = false;
      this._terrainReady = false;
      this._firstFocusDone = false;
    },

_debug(...args) { if (this._config.debug) console.debug(`[${TAG}]`, ...args); }
  });

  if (!customElements.get(TAG)) customElements.define(TAG, Card);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === TAG)) window.customCards.push({ type: TAG, name: 'Emergency Orbit 3D Card', description: 'MapLibre 3D emergency map with terrain, buildings, cinematic fly-in and helicopter orbit', preview: true });
  console.info('%c EMERGENCY ORBIT 3D CARD %c v' + VERSION + ' ', 'color:white;background:#1769aa;font-weight:700;padding:3px 5px;border-radius:4px 0 0 4px', 'color:#dbeafe;background:#0f172a;font-weight:700;padding:3px 5px;border-radius:0 4px 4px 0');

})();
