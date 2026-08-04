/* Same-origin worker entry point for Emergency Orbit Map Card. */
try {
  importScripts('https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl-csp-worker.js');
} catch (primaryError) {
  try {
    importScripts('https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl-csp-worker.js');
  } catch (fallbackError) {
    console.error('Emergency Orbit Map Card could not load the MapLibre CSP worker.', primaryError, fallbackError);
    throw fallbackError;
  }
}
