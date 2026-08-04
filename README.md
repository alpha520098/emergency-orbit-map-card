# Emergency Orbit Map Card

A Home Assistant dashboard card that displays emergency incidents on a pitched 3D map, flies to new or escalated incidents, and performs a controlled helicopter-style orbit.

## Current status

**Version:** `0.1.3-alpha`

This is an early test release. It uses MapLibre GL JS 5.24.0's CSP build and a same-origin HACS worker entry point to avoid the blob-worker startup failure seen with the earlier alpha builds.

## Installation through HACS

1. Open **HACS → Dashboard**.
2. Open the three-dot menu and select **Custom repositories**.
3. Add:

   ```text
   https://github.com/alpha520098/emergency-orbit-map-card
   ```

4. Select **Dashboard** as the repository category.
5. Install or redownload **Emergency Orbit Map Card**.
6. Hard-refresh the browser after installation.

HACS downloads every JavaScript file in `dist/`. This card requires both:

```text
dist/emergency-orbit-map-card.js
dist/maplibre-csp-worker-proxy.js
```

## First test

Use demo mode before connecting live entities:

```yaml
type: custom:emergency-orbit-map-card
title: Emergency Orbit Test

region:
  mode: home
  label: Macarthur
  radius_km: 40

map:
  height: 520
  terrain: true

camera:
  orbit: true
  orbit_duration: 22000
  auto_return: false

demo_mode: true
```

During startup the card should show:

```text
Loading local CSP map engine…
Card 0.1.3-alpha
```

followed briefly by:

```text
Starting CSP-safe map canvas…
Worker: local HACS file
```

If startup fails, the card replaces the loading screen with a specific error instead of remaining stuck indefinitely.

## Live ABC Emergency configuration

```yaml
type: custom:emergency-orbit-map-card
title: Macarthur Emergency Map

entities:
  incidents: sensor.abc_emergency_home_nearby_incidents
  nearest: sensor.abc_emergency_home_nearest_incident
  active: binary_sensor.abc_emergency_home_active_alert
  inside_polygon: binary_sensor.abc_emergency_home_inside_polygon

region:
  mode: home
  label: Macarthur
  radius_km: 40

map:
  height: 520
  terrain: true
  overview_pitch: 48
  incident_pitch: 62
  incident_zoom: 14.2

camera:
  orbit: true
  orbit_duration: 22000
  auto_return: true
  auto_return_delay: 30000

demo_mode: false
```

## Region modes

### Home Assistant location

```yaml
region:
  mode: home
  radius_km: 40
```

### Custom centre

```yaml
region:
  mode: custom
  label: Newcastle and Lower Hunter
  latitude: -32.9283
  longitude: 151.7817
  radius_km: 50
```

### Explicit bounds

```yaml
region:
  mode: bounds
  label: Defined operational area
  north: -33.85
  south: -34.25
  east: 151.05
  west: 150.50
```

## How the CSP startup works

The main card loads MapLibre's CSP build and calls `setWorkerUrl()` before creating the map. The worker URL points to the HACS-installed same-origin file:

```text
/hacsfiles/emergency-orbit-map-card/maplibre-csp-worker-proxy.js
```

That worker entry point loads the matching MapLibre CSP worker payload. This avoids the ordinary MapLibre build's blob worker, which was the cause of the permanent startup screen in the earlier alpha.

The card starts with a local empty style. After the map renderer is alive, it attempts the configured basemap and then fallback styles. A failed basemap therefore does not prevent the map canvas or incident markers from starting.

## External services

This alpha still requests MapLibre assets and map data from public services:

- jsDelivr, with unpkg fallback, for MapLibre's CSP library and worker payload.
- OpenFreeMap for the primary vector basemap.
- MapLibre demo tiles as a fallback basemap.
- AWS Open Terrain Tiles for elevation data.

A later release can bundle the full MapLibre distribution and support locally hosted map tiles.

## Troubleshooting

Confirm the dashboard resource is:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js
```

When forcing a cache refresh, temporarily use:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js?v=0.1.3
```

Then:

1. Redownload the repository through HACS.
2. Restart Home Assistant.
3. Hard-refresh with `Ctrl + F5`.
4. Confirm the card displays `0.1.3-alpha` during startup.
5. Check the browser console for messages beginning with `[emergency-orbit-map-card]`.

## License

MIT
