/* Emergency Orbit 3D Card loader v0.1.0-alpha.1 */
const loadPart = (name) => new Promise((resolve, reject) => {
  const url = new URL(name, import.meta.url);
  const existing = document.querySelector(`script[data-eom3d-part="${name}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') return resolve();
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = url.href;
  script.async = false;
  script.crossOrigin = 'anonymous';
  script.dataset.eom3dPart = name;
  script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
  script.onerror = () => reject(new Error(`Failed to load ${url.href}`));
  document.head.appendChild(script);
});

for (const part of [
  'eom3d-core.js',
  'eom3d-ui.js',
  'eom3d-card-base.js',
  'eom3d-card-map.js',
  'eom3d-card-data.js',
  'eom3d-card-camera.js',
]) {
  await loadPart(part);
}
