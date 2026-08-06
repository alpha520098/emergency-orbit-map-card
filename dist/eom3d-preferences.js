/* Emergency Orbit 3D Card saved preferences v0.1.0-alpha.5 */
(() => {
  'use strict';

  const core = window.__EOM3D || {};
  const Card = window.__EOM3D_CARD_CLASS;
  if (!core.TAG || !Card) throw new Error('Emergency Orbit 3D preferences loaded before the card base.');

  const DEFAULTS = Object.freeze({ enabled: true, auto_hide_after_save: true, storage_key: '' });
  const normalise = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const normaliseConfig = (config = {}) => ({
    ...config,
    preferences: { ...DEFAULTS, ...(config.preferences || {}) },
  });

  const storageKeyFor = (config) => {
    const explicit = String(config.preferences?.storage_key || '').trim();
    if (explicit) return `emergency-orbit-3d-preferences:${explicit}`;
    const identity = [config.entities?.incidents, config.title, config.region?.label]
      .filter(Boolean).join('|').toLowerCase().replace(/[^a-z0-9|_-]+/g, '_');
    return `emergency-orbit-3d-preferences:${identity || 'default'}`;
  };

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) { return null; }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  };

  const switchRows = (card) => [...card.shadowRoot.querySelectorAll('.switch-row')]
    .map((row) => {
      const input = row.querySelector('input[type="checkbox"]');
      const label = normalise(row.querySelector('.switch-copy strong')?.textContent || row.textContent);
      return input && label ? { row, input, label } : null;
    }).filter(Boolean);

  const findSwitch = (card, fragment) => switchRows(card)
    .find(({ label }) => label.includes(normalise(fragment)));

  const collect = (card) => ({
    version: 2,
    panel_dismissed: true,
    switches: Object.fromEntries(switchRows(card).map(({ label, input }) => [label, Boolean(input.checked)])),
    filters: card._filterState ? JSON.parse(JSON.stringify(card._filterState)) : null,
  });

  const refreshTabs = (card) => {
    const statewide = findSwitch(card, 'nsw-wide');
    const tabs = card.shadowRoot.querySelector('.scope-tabs');
    if (!tabs || !statewide) return;
    tabs.querySelector('[data-scope="local"]')?.classList.toggle('active', !statewide.input.checked);
    tabs.querySelector('[data-scope="statewide"]')?.classList.toggle('active', statewide.input.checked);
  };

  const applySaved = (card) => {
    const saved = card._savedPreferences;
    if (!saved) return;

    for (const { label, input } of switchRows(card)) {
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
    refreshTabs(card);
  };

  const install = (card) => {
    if (card._config.preferences?.enabled === false) return;
    const controls = card.shadowRoot.querySelector('.controls');
    if (!controls || card.shadowRoot.querySelector('.preferences-panel')) return;

    const style = card.shadowRoot.querySelector('style');
    if (style) style.textContent += `
      .scope-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:13px 0 4px;padding:4px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(0,0,0,.14)}
      .scope-tab{min-height:36px;border:1px solid transparent;border-radius:10px;background:transparent;color:#91a1b5;cursor:pointer;font-size:10px;font-weight:900;letter-spacing:.08em}
      .scope-tab.active{color:#eef5ff;border-color:rgba(89,154,255,.58);background:rgba(75,140,255,.2);box-shadow:inset 0 0 0 1px rgba(75,140,255,.08)}
      .preferences-panel{margin-top:11px;padding-top:11px;border-top:1px solid rgba(255,255,255,.08)}
      .preference-actions{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px}
      .save-preferences{border-color:rgba(96,226,147,.48)!important;background:rgba(96,226,147,.14)!important;color:#e2faeb!important}
      .reset-preferences{color:#aebccd!important}
      .preference-status{min-height:16px;margin-top:7px;color:#7f91a8;font-size:9px;text-align:center;letter-spacing:.04em}
      .preference-status.saved{color:#60e293}
    `;

    const panelCopy = controls.querySelector('.panel-copy');
    const tabs = document.createElement('div');
    tabs.className = 'scope-tabs';
    tabs.innerHTML = `
      <button class="scope-tab" type="button" data-scope="local">LOCAL</button>
      <button class="scope-tab" type="button" data-scope="statewide">NSW-WIDE</button>`;
    panelCopy?.insertAdjacentElement('afterend', tabs);

    const statewide = findSwitch(card, 'nsw-wide');
    if (statewide) {
      statewide.row.style.display = 'none';
      tabs.querySelector('[data-scope="local"]').addEventListener('click', () => {
        if (statewide.input.checked) {
          statewide.input.checked = false;
          statewide.input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
        refreshTabs(card);
      });
      tabs.querySelector('[data-scope="statewide"]').addEventListener('click', () => {
        if (!statewide.input.checked) {
          statewide.input.checked = true;
          statewide.input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
        refreshTabs(card);
      });
      statewide.input.addEventListener('change', () => refreshTabs(card));
    } else {
      tabs.hidden = true;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'preferences-panel';
    wrapper.innerHTML = `
      <div class="preference-actions">
        <button class="action reset-preferences" type="button">RESET</button>
        <button class="action save-preferences" type="button">SAVE PREFERENCES</button>
      </div>
      <div class="preference-status">${card._savedPreferences ? 'Saved preferences loaded' : 'Preferences are not saved yet'}</div>`;
    controls.appendChild(wrapper);

    const status = wrapper.querySelector('.preference-status');
    wrapper.querySelector('.save-preferences').addEventListener('click', () => {
      const preferences = collect(card);
      if (!write(card._preferencesStorageKey, preferences)) {
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

    queueMicrotask(() => {
      applySaved(card);
      refreshTabs(card);
    });
  };

  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function setConfigWithSavedPreferences(config) {
    const next = normaliseConfig(config);
    this._preferencesStorageKey = storageKeyFor(next);
    this._savedPreferences = next.preferences.enabled === false ? null : read(this._preferencesStorageKey);
    const result = originalSetConfig.call(this, next);
    if (this._savedPreferences?.panel_dismissed) {
      this._panelOpen = false;
      this.shadowRoot.querySelector('.controls')?.classList.add('closed');
    }
    install(this);
    return result;
  };

  const originalRender = window.__EOM3D_RENDER;
  window.__EOM3D_RENDER = function renderWithSavedPreferences() {
    if (this._savedPreferences?.panel_dismissed) this._panelOpen = false;
    originalRender.call(this);
    install(this);
  };

  console.info('%c EMERGENCY ORBIT 3D %c preferences alpha.5 ', 'color:white;background:#1976d2;padding:3px', 'color:#dbeafe;background:#0f172a;padding:3px');
})();
