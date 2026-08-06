/* Emergency Orbit HACS entrypoint v0.1.0-alpha.10 */
const EOM_HACS_BUILD = '0.1.0-alpha.10';
const EOM_DIST_URL = 'https://cdn.jsdelivr.net/gh/alpha520098/emergency-orbit-map-card@ca2e89ec31aeae1a0b31aba35d0a93233d1d3fd6/dist/emergency-orbit-3d-card.js';
await import(`${EOM_DIST_URL}?v=${EOM_HACS_BUILD}`);
console.info(`EMERGENCY ORBIT 3D HACS ENTRYPOINT ${EOM_HACS_BUILD}`);
