/* Emergency Orbit 3D Card automatic preferences v0.1.0-alpha.6 */
(() => {
  'use strict';

  const core = window.__EOM3D || {};
  const Card = window.__EOM3D_CARD_CLASS;
  if (!core.TAG || !Card) throw new Error('Emergency Orbit 3D preferences loaded before the card base.');

  const DEFAULTS = Object.freeze({ enabled: true, storage_key: '' });
  const normalise = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const normaliseConfig = (config = {}) => ({
    ...config,
    preferences: { ...DEFAULTS, ...(config.preferences || {}) },
  });

  const storageKeyFor = (config) => {
    const explicit = String(config.preferences?.storage_key || '').trim();
    if (explicit) return `emergency-orbit-3d-preferences:${explicit}`;
    const identity = [config.entities?.incidents, config.title, config.region?.label]
      .filter(Boolean)
      .join('|')
      .toLowerCase()
      .replace(/[^a-z0-9|_-]+/g, '_');
    return `emergency-orbit-3d-preferences:${identity || 'default'}`;
  };

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  };

  const switchRows = (card) => [...card.shadowRoot.querySelectorAll('.switch-row')]
    .map((row) => {
      const input = row.querySelector('input[type="checkbox"]');
      const label = normalise(row.querySelector('.switch-copy strong')?.textContent || row.textContent);
      return input && label ? { input, label } : null;
    })
    .filter(Boolean);

  const collect = (card) => ({
    version: 3,
    configured: true,
    panel_dismissed: true,
    switches: Object.fromEntries(
      switchRows(card).map(({ label, input }) => [label, Boolean(input.checked)])
    ),
    filters: card._filterState
      ? JSON.parse(JSON.stringify(card._filterState))
      : null,
  });

  const save = (card) => {
    if (card._config.preferences?.enabled === false || card._applyingSavedPreferences) return;
    const next = collect(card);
    if (write(card._preferencesStorageKey, next)) card._savedPreferences = next;
  };

  const applySaved = (card) => {
    const saved = card._savedPreferences;
    if (!saved || card._applyingSavedPreferences) return;

    card._applyingSavedPreferences = true;
    try {
      for (const { label, input } of switchRows(card)) {
        const next = saved.switches?.[label];
        if (typeof next !== 'boolean' || input.checked === next) continue;
        input.checked = next;
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      }

      if (saved.filters && card._filterState) {
        card._filterState = {
          categories: {
            ...card._filterState.categories,
            ...(saved.filters.categories || {}),
          },
          severity: {
            ...card._filterState.severity,
            ...(saved.filters.severity || {}),
          },
        };
        card._updateFilterControls?.();
        card._suppressNextFocus = true;
        card._firstFocusDone = true;
        card._updateFromHass?.();
      }
    } finally {
      card._applyingSavedPreferences = false;
    }
  };

  const installAutosave = (card) => {
    if (card._config.preferences?.enabled === false || card._preferencesAutosaveInstalled) return;
    const controls = card.shadowRoot.querySelector('.controls');
    if (!controls) return;

    card._preferencesAutosaveInstalled = true;

    controls.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      queueMicrotask(() => save(card));
    });

    queueMicrotask(() => applySaved(card));
  };

  const originalChangeFilter = Card.prototype._changeFilter;
  if (typeof originalChangeFilter === 'function') {
    Card.prototype._changeFilter = function changeFilterWithAutosave(group, key) {
      const result = originalChangeFilter.call(this, group, key);
      queueMicrotask(() => save(this));
      return result;
    };
  }

  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function setConfigWithAutomaticPreferences(config) {
    const next = normaliseConfig(config);
    this._preferencesStorageKey = storageKeyFor(next);
    this._savedPreferences = next.preferences.enabled === false
      ? null
      : read(this._preferencesStorageKey);

    const result = originalSetConfig.call(this, next);

    if (this._savedPreferences?.configured || this._savedPreferences?.panel_dismissed) {
      this._panelOpen = false;
      this.shadowRoot.querySelector('.controls')?.classList.add('closed');
    }

    installAutosave(this);
    return result;
  };

  const originalRender = window.__EOM3D_RENDER;
  window.__EOM3D_RENDER = function renderWithAutomaticPreferences() {
    if (this._savedPreferences?.configured || this._savedPreferences?.panel_dismissed) {
      this._panelOpen = false;
    }
    originalRender.call(this);
    this._preferencesAutosaveInstalled = false;
    installAutosave(this);
  };

  console.info('%c EMERGENCY ORBIT 3D %c automatic preferences alpha.6 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
})();
