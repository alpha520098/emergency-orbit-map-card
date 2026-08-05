/* Emergency Orbit 3D Card category and severity filters v0.1.0-alpha.3 */
(() => {
  'use strict';

  const core = window.__EOM3D || {};
  const { TAG, LEVELS, escapeHtml, normaliseLevel, numberValue } = core;
  const Card = window.__EOM3D_CARD_CLASS;

  if (!TAG || !Card) throw new Error('Emergency Orbit 3D filters loaded before the card base.');

  const CATEGORY_KEYS = ['weather', 'fire', 'flood', 'mva', 'rescue', 'other'];
  const SEVERITY_KEYS = ['information', 'advice', 'watch_and_act', 'emergency_warning'];

  const CATEGORY_LABELS = Object.freeze({
    weather: 'WEATHER',
    fire: 'FIRE',
    flood: 'FLOOD',
    mva: 'MVA',
    rescue: 'RESCUE',
    other: 'OTHER',
  });

  const SEVERITY_LABELS = Object.freeze({
    information: 'INFO',
    advice: 'ADVICE',
    watch_and_act: 'WATCH',
    emergency_warning: 'WARNING',
  });

  const FILTER_DEFAULTS = Object.freeze({
    enabled: true,
    remember_selection: true,
    fit_on_change: true,
    storage_key: '',
    categories: Object.freeze({
      weather: true,
      fire: true,
      flood: true,
      mva: true,
      rescue: true,
      other: true,
    }),
    severity: Object.freeze({
      information: true,
      advice: true,
      watch_and_act: true,
      emergency_warning: true,
    }),
  });

  const normaliseFilterConfig = (config = {}) => ({
    ...config,
    filters: {
      ...FILTER_DEFAULTS,
      ...(config.filters || {}),
      categories: {
        ...FILTER_DEFAULTS.categories,
        ...(config.filters?.categories || {}),
      },
      severity: {
        ...FILTER_DEFAULTS.severity,
        ...(config.filters?.severity || {}),
      },
    },
  });

  const booleanSelection = (keys, defaults, saved) => Object.fromEntries(
    keys.map((key) => [key, typeof saved?.[key] === 'boolean' ? saved[key] : defaults[key] !== false])
  );

  const storageKeyFor = (config) => {
    const explicit = String(config.filters?.storage_key || '').trim();
    if (explicit) return `emergency-orbit-3d-filters:${explicit}`;
    const identity = [config.entities?.incidents, config.title, config.region?.label]
      .filter(Boolean)
      .join('|')
      .toLowerCase()
      .replace(/[^a-z0-9|_-]+/g, '_');
    return `emergency-orbit-3d-filters:${identity || 'default'}`;
  };

  const loadFilterState = (card, config) => {
    const defaults = {
      categories: booleanSelection(CATEGORY_KEYS, config.filters.categories),
      severity: booleanSelection(SEVERITY_KEYS, config.filters.severity),
    };

    if (config.filters.remember_selection === false) return defaults;

    try {
      const saved = JSON.parse(localStorage.getItem(card._filterStorageKey) || 'null');
      if (!saved || typeof saved !== 'object') return defaults;
      return {
        categories: booleanSelection(CATEGORY_KEYS, defaults.categories, saved.categories),
        severity: booleanSelection(SEVERITY_KEYS, defaults.severity, saved.severity),
      };
    } catch (_) {
      return defaults;
    }
  };

  const saveFilterState = (card) => {
    if (card._config.filters?.remember_selection === false) return;
    try {
      localStorage.setItem(card._filterStorageKey, JSON.stringify(card._filterState));
    } catch (_) {
      // Storage is optional. The filter still works for the current session.
    }
  };

  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function setConfigWithFilters(config) {
    const next = normaliseFilterConfig(config);
    this._filterStorageKey = storageKeyFor(next);
    this._filterState = loadFilterState(this, next);
    this._unfilteredIncidents = [];
    return originalSetConfig.call(this, next);
  };

  const filterChip = (group, key, label) => `
    <button class="filter-chip" type="button" data-filter-group="${group}" data-filter-key="${key}" aria-pressed="false">
      <span class="filter-check">✓</span>
      <span>${escapeHtml(label)}</span>
      <span class="filter-count">0</span>
    </button>`;

  const installFilterControls = (card) => {
    if (!card?._els?.list || card.shadowRoot.querySelector('.incident-filters')) return;

    const style = card.shadowRoot.querySelector('style');
    if (style) style.textContent += `
      .incident-filters{margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:rgba(0,0,0,.12)}
      .filter-section+.filter-section{margin-top:11px}
      .filter-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;color:#8393a8;font-size:8px;font-weight:900;letter-spacing:.14em}
      .filter-chips{display:flex;flex-wrap:wrap;gap:6px}
      .filter-chip{min-height:27px;display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid rgba(255,255,255,.085);border-radius:999px;color:#91a1b5;background:rgba(255,255,255,.035);cursor:pointer;font-size:8px;font-weight:900;letter-spacing:.055em;transition:background .15s,border-color .15s,color .15s,transform .15s}
      .filter-chip:hover{transform:translateY(-1px);border-color:rgba(113,170,255,.55);color:#dbe9fa}
      .filter-chip.active{color:#dceaff;border-color:rgba(113,170,255,.65);background:rgba(75,140,255,.18);box-shadow:inset 0 0 0 1px rgba(75,140,255,.08)}
      .filter-chip.all.active{background:rgba(96,226,147,.15);border-color:rgba(96,226,147,.5);color:#d9f9e5}
      .filter-check{width:11px;color:#71aaff;opacity:0;transform:scale(.65);transition:.14s}
      .filter-chip.active .filter-check{opacity:1;transform:scale(1)}
      .filter-chip.all .filter-check{color:#60e293}
      .filter-count{min-width:16px;padding:1px 4px;border-radius:999px;color:#8fa1b7;background:rgba(255,255,255,.055);font-size:7px;text-align:center}
      .filter-chip.active .filter-count{color:#d9e8fa;background:rgba(255,255,255,.09)}
      @media(max-width:500px){.incident-filters{padding:10px}.filter-chip{font-size:7px;padding:5px 6px}}
    `;

    const section = document.createElement('div');
    section.className = 'incident-filters';
    section.hidden = card._config.filters?.enabled === false;
    section.innerHTML = `
      <div class="filter-section">
        <div class="filter-heading"><span>INCIDENT TYPE</span><span class="category-summary"></span></div>
        <div class="filter-chips category-chips">
          ${filterChip('categories', 'all', 'ALL')}
          ${CATEGORY_KEYS.map((key) => filterChip('categories', key, CATEGORY_LABELS[key])).join('')}
        </div>
      </div>
      <div class="filter-section">
        <div class="filter-heading"><span>ALERT LEVEL</span><span class="severity-summary"></span></div>
        <div class="filter-chips severity-chips">
          ${filterChip('severity', 'all', 'ALL')}
          ${SEVERITY_KEYS.map((key) => filterChip('severity', key, SEVERITY_LABELS[key])).join('')}
        </div>
      </div>`;

    card._els.list.parentNode.insertBefore(section, card._els.list);
    card._els.filters = section;
    card._els.categorySummary = section.querySelector('.category-summary');
    card._els.severitySummary = section.querySelector('.severity-summary');

    section.querySelectorAll('[data-filter-group]').forEach((button) => {
      button.addEventListener('click', () => {
        card._changeFilter(button.dataset.filterGroup, button.dataset.filterKey);
      });
    });

    card._updateFilterControls();
  };

  const originalRender = window.__EOM3D_RENDER;
  window.__EOM3D_RENDER = function renderWithIncidentFilters() {
    originalRender.call(this);
    installFilterControls(this);
  };

  const originalCollectIncidents = Card.prototype._collectIncidents;
  const originalRenderIncidentList = Card.prototype._renderIncidentList;

  Object.assign(Card.prototype, {
    _incidentCategory(incident) {
      const typeText = String(incident?.type || '').toLowerCase();
      const fullText = [
        incident?.type,
        incident?.headline,
        incident?.alertText,
        incident?.location,
        incident?.status,
      ].filter(Boolean).join(' ').toLowerCase();

      const matches = (terms, text = fullText) => terms.some((term) => text.includes(term));

      if (matches(['bushfire', 'bush fire', 'grass fire', 'structure fire', 'building fire', 'house fire', 'industrial fire', 'hazard reduction', 'smoke', 'fire'], fullText)) return 'fire';
      if (matches(['flash flood', 'riverine flood', 'flooding', 'flood', 'tsunami', 'coastal inundation'])) return 'flood';
      if (matches(['thunderstorm', 'storm', 'lightning', 'hail', 'damaging wind', 'destructive wind', 'strong wind', 'cyclone', 'tornado', 'heatwave', 'heat wave', 'snow', 'blizzard', 'fog', 'dust storm', 'severe weather', 'weather'])) return 'weather';
      if (matches(['motor vehicle', 'vehicle incident', 'traffic incident', 'road crash', 'car crash', 'truck crash', 'collision', 'multi vehicle', 'multi-vehicle', 'accident', 'road closed', 'mva'])) return 'mva';
      if (matches(['marine rescue', 'alpine rescue', 'vertical rescue', 'road rescue', 'rescue', 'missing person', 'search operation', 'search and rescue', 'trapped person'])) return 'rescue';
      return 'other';
    },

    _incidentSeverityGroup(incident) {
      const level = normaliseLevel(incident?.level);
      if (level === 'extreme') return 'emergency_warning';
      if (level === 'severe') return 'watch_and_act';
      if (level === 'moderate') return 'advice';
      return 'information';
    },

    _incidentPassesFilters(incident) {
      if (this._config.filters?.enabled === false) return true;
      const category = incident.filterCategory || this._incidentCategory(incident);
      const severity = incident.filterSeverity || this._incidentSeverityGroup(incident);
      return this._filterState?.categories?.[category] !== false && this._filterState?.severity?.[severity] !== false;
    },

    _collectIncidents() {
      const all = originalCollectIncidents.call(this).map((incident) => ({
        ...incident,
        filterCategory: this._incidentCategory(incident),
        filterSeverity: this._incidentSeverityGroup(incident),
      }));
      this._unfilteredIncidents = all;
      return all.filter((incident) => this._incidentPassesFilters(incident));
    },

    _changeFilter(group, key) {
      if (!['categories', 'severity'].includes(group)) return;
      const keys = group === 'categories' ? CATEGORY_KEYS : SEVERITY_KEYS;
      const current = this._filterState?.[group] || {};

      if (key === 'all') {
        this._filterState[group] = Object.fromEntries(keys.map((item) => [item, true]));
      } else if (keys.includes(key)) {
        this._filterState[group] = { ...current, [key]: current[key] === false };
      }

      saveFilterState(this);
      this._suppressNextFocus = true;
      this._firstFocusDone = true;
      this._updateFromHass();
      this._updateFilterControls();

      if (this._config.filters?.fit_on_change !== false && this._mapReady) {
        window.setTimeout(() => this._showOverview(true), 0);
      }
    },

    _updateFilterControls() {
      if (!this._els?.filters) return;
      const allIncidents = this._unfilteredIncidents || [];

      const updateGroup = (group, keys) => {
        const selection = this._filterState?.[group] || {};
        const allActive = keys.every((key) => selection[key] !== false);
        this._els.filters.querySelectorAll(`[data-filter-group="${group}"]`).forEach((button) => {
          const key = button.dataset.filterKey;
          const active = key === 'all' ? allActive : selection[key] !== false;
          button.classList.toggle('active', active);
          button.classList.toggle('all', key === 'all');
          button.setAttribute('aria-pressed', String(active));

          const count = button.querySelector('.filter-count');
          if (!count) return;
          if (key === 'all') count.textContent = String(allIncidents.length);
          else if (group === 'categories') count.textContent = String(allIncidents.filter((incident) => incident.filterCategory === key).length);
          else count.textContent = String(allIncidents.filter((incident) => incident.filterSeverity === key).length);
        });
        return keys.filter((key) => selection[key] !== false).length;
      };

      const categoryActive = updateGroup('categories', CATEGORY_KEYS);
      const severityActive = updateGroup('severity', SEVERITY_KEYS);
      if (this._els.categorySummary) this._els.categorySummary.textContent = `${categoryActive}/${CATEGORY_KEYS.length} ACTIVE`;
      if (this._els.severitySummary) this._els.severitySummary.textContent = `${severityActive}/${SEVERITY_KEYS.length} ACTIVE`;
    },

    _renderIncidentList() {
      originalRenderIncidentList.call(this);
      if (!this._els) return;

      const visible = this._incidents.length;
      const total = this._unfilteredIncidents?.length ?? visible;
      const visibleLocal = this._incidents.filter((incident) => incident.scope !== 'statewide').length;
      const visibleStatewide = this._incidents.filter((incident) => incident.scope === 'statewide').length;
      const feedTotal = numberValue(this._hass?.states?.[this._config.statewide?.total_entity]?.state);

      if (this._statewideEnabled) {
        const feedSuffix = Number.isFinite(feedTotal) && feedTotal !== visibleStatewide ? ` · ${feedTotal} FEED` : '';
        this._els.total.textContent = `${visible}/${total} VISIBLE · ${visibleLocal} LOCAL · ${visibleStatewide} NSW${feedSuffix}`;
      } else {
        this._els.total.textContent = `${visible}/${total} VISIBLE · ${visibleLocal} LOCAL`;
      }

      this._updateFilterControls();
    },
  });

  queueMicrotask(() => {
    document.querySelectorAll(TAG).forEach((card) => {
      if (!card._filterState) {
        const config = normaliseFilterConfig(card._config || {});
        card._config = config;
        card._filterStorageKey = storageKeyFor(config);
        card._filterState = loadFilterState(card, config);
        card._unfilteredIncidents = [];
      }
      if (!card.shadowRoot?.querySelector('.incident-filters')) {
        card._render();
        if (card.isConnected) card._ensureMap();
      }
    });
  });

  console.info('%c EMERGENCY ORBIT 3D %c incident filters alpha.3 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
})();
