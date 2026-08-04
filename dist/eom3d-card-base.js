/* Emergency Orbit 3D Card base v0.1.0-alpha.1 */
(() => {
  'use strict';

  const { TAG, VERSION, DEFAULTS, merge, numberValue } = window.__EOM3D || {};
  if (!TAG) throw new Error('Emergency Orbit 3D core was not loaded.');
  class EmergencyOrbit3DCard extends HTMLElement {
    static getStubConfig() { return merge(DEFAULTS, { demo_mode: true }); }

constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = DEFAULTS;
      this._hass = null;
      this._map = null;
      this._mapReady = false;
      this._initialising = false;
      this._layersReady = false;
      this._incidents = [];
      this._markers = new Map();
      this._homeMarker = null;
      this._selectedId = null;
      this._previousLevels = new Map();
      this._firstFocusDone = false;
      this._motionToken = 0;
      this._orbitFrame = 0;
      this._returnTimer = 0;
      this._moveFallback = 0;
      this._updateFrame = 0;
      this._resizeObserver = null;
      this._panelOpen = true;
      this._terrainReady = false;
      this._suppressNextFocus = false;
    }
  }

  Object.defineProperty(EmergencyOrbit3DCard.prototype, 'hass', {
    configurable: true,
    set(hass) {
      this._hass = hass;
      if (!this.shadowRoot.innerHTML) this._render();
      cancelAnimationFrame(this._updateFrame);
      this._updateFrame = requestAnimationFrame(() => this._updateFromHass());
    },
  });
  Object.assign(EmergencyOrbit3DCard.prototype, {
setConfig(config) {
      if (!config) throw new Error('Emergency Orbit 3D Card requires configuration.');
      this._config = merge(DEFAULTS, config);
      this._panelOpen = this._config.display.panel_open !== false;
      this._render();
      if (this.isConnected) this._ensureMap();
    },

connectedCallback() {
      this._ensureMap();
      if (!this._resizeObserver && typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this._map?.resize());
        this._resizeObserver.observe(this);
      }
    },

disconnectedCallback() {
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
      cancelAnimationFrame(this._updateFrame);
      this._destroyMap();
    },

getCardSize() { return Math.ceil((numberValue(this._config.map.height) ?? 620) / 50); },

getGridOptions() { return { columns: 12, rows: Math.ceil((numberValue(this._config.map.height) ?? 620) / 56), min_columns: 6, min_rows: 5 }; },

_render() {
      if (!window.__EOM3D_RENDER) throw new Error('Emergency Orbit 3D UI was not loaded.');
      window.__EOM3D_RENDER.call(this);
    }
  });
  window.__EOM3D_CARD_CLASS = EmergencyOrbit3DCard;

})();
