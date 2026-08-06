/* Emergency Orbit HACS entrypoint v0.1.0-alpha.9 */
const EOM_HACS_BUILD = '0.1.0-alpha.9';
const loader = new URL(`./dist/emergency-orbit-3d-card.js?v=${EOM_HACS_BUILD}`, import.meta.url);
await import(loader.href);
console.info(`EMERGENCY ORBIT 3D HACS ENTRYPOINT ${EOM_HACS_BUILD}`);
