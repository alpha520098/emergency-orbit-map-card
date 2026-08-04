/* Emergency Orbit 3D Card map engine v0.1.0-alpha.1 */
(() => {
  'use strict';
  const { numberValue, loadMapLibre, EMPTY_FC } = window.__EOM3D || {};

  const Card = window.__EOM3D_CARD_CLASS;
  if (!Card) throw new Error('Emergency Orbit 3D card base was not loaded.');
  Object.assign(Card.prototype, {
async _ensureMap() {
      if (this._map || this._initialising || !this._els?.map) return;
      this._initialising = true;
      try {
        const maplibregl = await loadMapLibre(this._config.map.maplibre_script_url);
        if (!this.isConnected || this._map) return;
        const region = this._region();
        this._els.region.textContent = region.label;
        this._map = new maplibregl.Map({
          container: this._els.map,
          style: this._config.map.style_url,
          center: region.center,
          zoom: this._overviewZoom(region),
          pitch: numberValue(this._config.map.overview_pitch) ?? 50,
          bearing: numberValue(this._config.map.overview_bearing) ?? -18,
          antialias: true,
          attributionControl: true,
          minZoom: numberValue(this._config.map.min_zoom) ?? 4,
          maxZoom: numberValue(this._config.map.max_zoom) ?? 18,
          maxPitch: 78,
          cooperativeGestures: false,
        });
        if (this._config.display.show_controls) this._map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), 'bottom-right');
        this._map.on('load', () => this._onMapLoad());
        this._map.on('move', () => this._updateReadout());
        this._map.on('error', (event) => this._onMapError(event));
        this._map.getCanvasContainer().addEventListener('pointerdown', () => this._stopMotion(false));
      } catch (error) {
        this._showError(error);
      } finally {
        this._initialising = false;
      }
    },

_onMapLoad() {
      try {
        this._installTerrain();
        this._installLayers();
        this._installBuildings();
        this._installHomeMarker();
        this._mapReady = true;
        this._layersReady = true;
        this._els.loading.hidden = true;
        this._setSystem(this._terrainReady ? 'SYSTEM READY' : 'MAP READY');
        this._showOverview(false);
        this._syncMapData();
        window.setTimeout(() => this._map?.resize(), 80);
      } catch (error) {
        this._showError(error);
      }
    },

_onMapError(event) {
      const message = event?.error?.message || '';
      if (/terrain|elevation|raster-dem|terrarium/i.test(message)) {
        this._terrainReady = false;
        this._setSystem('MAP READY · TERRAIN DEGRADED');
        return;
      }
      this._debug('MapLibre warning', message || event);
    },

_installTerrain() {
      if (!this._config.map.terrain || this._map.getSource('eom3d-terrain')) return;
      this._map.addSource('eom3d-terrain', { type: 'raster-dem', tiles: [this._config.map.terrain_url], tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Elevation data © OpenStreetMap contributors, Mapzen and AWS Open Data' });
      this._map.setTerrain({ source: 'eom3d-terrain', exaggeration: numberValue(this._config.map.terrain_exaggeration) ?? 1.35 });
      const before = this._firstSymbolLayer();
      this._map.addLayer({ id: 'eom3d-hillshade', type: 'hillshade', source: 'eom3d-terrain', paint: { 'hillshade-shadow-color': '#02070d', 'hillshade-highlight-color': '#7894ae', 'hillshade-accent-color': '#162639', 'hillshade-exaggeration': 0.34, 'hillshade-illumination-direction': 315 } }, before);
      this._terrainReady = true;
    },

_installLayers() {
      const before = this._firstSymbolLayer();
      this._map.addSource('eom3d-region', { type: 'geojson', data: EMPTY_FC });
      this._map.addSource('eom3d-incident', { type: 'geojson', data: EMPTY_FC });
      this._map.addSource('eom3d-home-link', { type: 'geojson', data: EMPTY_FC });
      this._map.addLayer({ id: 'eom3d-region-fill', type: 'fill', source: 'eom3d-region', paint: { 'fill-color': '#3c82d7', 'fill-opacity': 0.045 } }, before);
      this._map.addLayer({ id: 'eom3d-region-line', type: 'line', source: 'eom3d-region', paint: { 'line-color': '#6aaeff', 'line-opacity': 0.46, 'line-width': 1.4, 'line-dasharray': [2.5, 2.5] } }, before);
      this._map.addLayer({ id: 'eom3d-home-link-line', type: 'line', source: 'eom3d-home-link', paint: { 'line-color': ['coalesce', ['get', 'colour'], '#4b8cff'], 'line-opacity': 0.66, 'line-width': 2, 'line-dasharray': [1.5, 1.5] } }, before);
      this._map.addLayer({ id: 'eom3d-incident-fill', type: 'fill', source: 'eom3d-incident', paint: { 'fill-color': ['coalesce', ['get', 'colour'], '#4b8cff'], 'fill-opacity': 0.18 } }, before);
      this._map.addLayer({ id: 'eom3d-incident-line', type: 'line', source: 'eom3d-incident', paint: { 'line-color': ['coalesce', ['get', 'colour'], '#4b8cff'], 'line-opacity': 0.96, 'line-width': 3 } }, before);
    },

_installBuildings() {
      if (!this._config.map.show_3d_buildings || this._map.getLayer('eom3d-buildings')) return;
      const layers = this._map.getStyle()?.layers || [];
      const candidate = layers.find((layer) => layer.type === 'fill' && /building/i.test(layer['source-layer'] || layer.id) && layer.source);
      if (!candidate) return;
      try {
        this._map.addLayer({ id: 'eom3d-buildings', source: candidate.source, 'source-layer': candidate['source-layer'], type: 'fill-extrusion', minzoom: 13.5, filter: candidate.filter || ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['zoom'], 13, '#162332', 17, '#344b61'], 'fill-extrusion-height': ['coalesce', ['to-number', ['get', 'render_height']], ['to-number', ['get', 'height']], 8], 'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], ['to-number', ['get', 'min_height']], 0], 'fill-extrusion-opacity': 0.58 } }, this._firstSymbolLayer());
      } catch (error) { this._debug('3D buildings unavailable', error); }
    },

_firstSymbolLayer() { return this._map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id; }
  });

})();
