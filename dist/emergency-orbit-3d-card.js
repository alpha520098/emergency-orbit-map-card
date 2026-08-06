/* Emergency Orbit 3D Card loader v0.1.0-alpha.8 */
const EOM3D_BUILD = '0.1.0-alpha.8';
const EOM3D_REMOTE_BASE = 'https://cdn.jsdelivr.net/gh/alpha520098/emergency-orbit-map-card@main/dist/';

const loadScript = (url, name, source) => new Promise((resolve, reject) => {
  const selector = `script[data-eom3d-part="${name}"][data-eom3d-build="${EOM3D_BUILD}"]`;
  const existing = document.querySelector(selector);
  if (existing) {
    if (existing.dataset.loaded === 'true') return resolve();
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = url;
  script.async = false;
  script.crossOrigin = 'anonymous';
  script.dataset.eom3dPart = name;
  script.dataset.eom3dBuild = EOM3D_BUILD;
  script.dataset.eom3dSource = source;
  script.onload = () => {
    script.dataset.loaded = 'true';
    resolve();
  };
  script.onerror = () => {
    script.remove();
    reject(new Error(`Failed to load ${url}`));
  };
  document.head.appendChild(script);
});

const loadPart = async (name) => {
  const remote = new URL(name, EOM3D_REMOTE_BASE);
  remote.searchParams.set('v', EOM3D_BUILD);

  try {
    await loadScript(remote.href, name, 'jsdelivr');
    return;
  } catch (remoteError) {
    const local = new URL(name, import.meta.url);
    local.searchParams.set('v', EOM3D_BUILD);
    try {
      await loadScript(local.href, name, 'local');
      return;
    } catch (localError) {
      throw new Error(`${remoteError.message}; ${localError.message}`);
    }
  }
};

for (const part of [
  'eom3d-core.js',
  'eom3d-ui.js',
  'eom3d-card-base.js',
  'eom3d-card-map.js',
  'eom3d-card-data.js',
  'eom3d-card-camera.js',
  'eom3d-statewide.js',
  'eom3d-filters.js',
  'eom3d-preferences.js',
]) {
  await loadPart(part);
}
