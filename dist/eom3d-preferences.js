/* Emergency Orbit 3D Card saved preferences v0.1.0-alpha.4 */
(() => {
  'use strict';

  const core = window.__EOM3D || {};
  const Card = window.__EOM3D_CARD_CLASS;
  if (!core.TAG || !Card) throw new Error('Emergency Orbit 3D preferences loaded before the card base.');

  const PREF_DEFAULTS = Object.freeze({
    enabled: true,
    auto_hide_after_save: true,
    storage_key: '',
  });

  const normaliseConfig = (config = {}) => ({
    ...config,
    preferences: {
      ...PREF_DEFAULTS,
      ...(config.preferences || {}),
    },
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

  const readPreferences = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  };

  const writePreferences = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  };

  const normaliseLabel = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const switchEntries = (card) => [...card.shadowRoot.querySelectorAll('.switch-row')]
    .map((row) => {
      const input = row.querySelector('input[type="checkbox"]');
      const strong = row.querySelector('.switch-copy strong');
      const label = normaliseLabel(strong?.textContent || row.textContent);
      return input && label ? { label, input } : null;
    })
    .filter(Boolean);

  const collectPreferences = (card) => ({
    version: 1,
    saved_at: new Date().toISOString(),
    panel_dismissed: true,
    switches: Object.fromEntries(switchEntries(card).map(({ label, input }) => [label, Boolean(input.checked)])),
    filters: card._filterState ? JSON.parse(JSON.stringify(card._filterState)) : null,
  });

  const applySavedPreferences = (card) => {
    const saved = card._savedPreferences;
    if (!saved) return;

    for (const { label, input } of switchEntries(card)) {
      const next = saved.switches?.[label];
      if (typeof next !== 'boolean' || input.checked === next) continue;
      input.checked = next;
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    if (saved.filters && card._filterState) {
      card._filterState = {
        categories: { ...card._filterState.categories, ...(saved.filters.categories || {}) },
        severity: { ...card._filterState.severity, ...(saved.filters.severity || {}) },
      };
      card._updateFilterControls?.();
      card._suppressNextFocus = true;
      card._firstFocusDone = true;
      card._updateFromHass?.();
    }
  };

  const installPreferenceControls = (card) => {
    if (card._config.preferences?.enabled === false) return;
    const controls = card.shadowRoot.querySelector('.controls');
    const grid = card.shadowRoot.querySelector('.button-grid');
    if (!controls || !grid || card.shadowRoot.querySelector('.preference-actions')) return;

    const style = card.shadowRoot.querySelector('style');
    if (style) style.textContent += `
      .preference-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}
      .save-preferences{border-color:rgba(96,226,147,.42);background:rgba(96,226,147,.12);color:#dff8e8}
      .save-preferences:hover{background:rgba(96,226,147,.2)}
      .reset-preferences{padding-inline:13px;color:#aebccd}
      .preference-status{min-height:15px;margin-top:7px;color:#7f91a8;font-size:9px;text-align:center;letter-spacing:.04em}
      .preference-status.saved{color:#60e293}
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'preference-actions';
    wrapper.innerHTML = `
      <button class="action save-preferences" type="button">SAVE PREFERENCES</button>
      <button class="action reset-preferences" type="button" title="Clear saved preferences">RESET</button>`;

    const status = document.createElement('div');
    status.className = 'preference-status';
    status.textContent = card._savedPreferences ? 'Saved preferences loaded' : 'Preferences are not saved yet';

    grid.insertAdjacentElement('afterend', wrapper);
    wrapper.insertAdjacentElement('afterend', status);

    wrapper.querySelector('.save-preferences').addEventListener('click', () => {
      const preferences = collectPreferences(card);
      const saved = writePreferences(card._preferencesStorageKey, preferences);
      if (!saved) {
        status.textContent = 'Browser storage is unavailable';
        status.classList.remove('saved');
        return;
      }
      card._savedPreferences = preferences;
      status.textContent = 'Preferences saved';
      status.classList.add('saved');
      if (card._config.preferences?.auto_hide_after_save !== false) {
        card._panelOpen = false;
        controls.classList.add('closed');
      }
    });

    wrapper.querySelector('.reset-preferences').addEventListener('click', () => {
      try { localStorage.removeItem(card._preferencesStorageKey); } catch (_) {}
      card._savedPreferences = null;
      status.textContent = 'Saved preferences cleared';
      status.classList.remove('saved');
    });

    queueMicrotask(() => applySavedPreferences(card));
  };

  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function setConfigWithSavedPreferences(config) {
    const next = normaliseConfig(config);
    this._preferencesStorageKey = storageKeyFor(next);
    this._savedPreferences = next.preferences.enabled === false ? null : readPreferences(this._preferencesStorageKey);
    const result = originalSetConfig.call(this, next);
    if (this._savedPreferences?.panel_dismissed) {
      this._panelOpen = false;
      this.shadowRoot.querySelector('.controls')?.classList.add('closed');
    }
    installPreferenceControls(this);
    return result;
  };

  const originalRender = window.__EOM3D_RENDER;
  window.__EOM3D_RENDER = function renderWithSavedPreferences() {
    if (this._savedPreferences?.panel_dismissed) this._panelOpen = false;
    originalRender.call(this);
    installPreferenceControls(this);
  };

  console.info('%c EMERGENCY ORBIT 3D %c saved preferences alpha.4 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
})();
