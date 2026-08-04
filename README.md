# Emergency Orbit Map Card

A Home Assistant dashboard card that displays live emergency incidents, flies to new or escalated events, renders supplied incident polygons, and performs a controlled helicopter-style orbit.

## Current status

**Version:** `0.2.0-alpha`

This release replaces MapLibre with a worker-free Leaflet renderer. The earlier MapLibre builds stalled inside some Home Assistant frontends while starting their Web Worker. Leaflet does not require a Web Worker, so the card now starts without the CSP and worker dependency that caused the permanent loading screen.

The pitched view is produced with CSS perspective and rotation. It is a convincing operational 3D-style view, but it is not a true terrain elevation mesh. The important parts remain: live incidents, polygons, fly-in, orbit, region selection and automatic return.

## Installation through HACS

1. Open **HACS → Dashboard**.
2. Open the three-dot menu and select **Custom repositories**.
3. Add:

   ```text
   https://github.com/alpha520098/emergency-orbit-map-card
   ```

4. Select **Dashboard** as the category.
5. Install or redownload **Emergency Orbit Map Card**.
6. Restart Home Assistant and hard-refresh the browser.

The installed dashboard resource should be:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js
```

For a forced cache refresh, temporarily use:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js?v=0.2.0
```

## First test

Use demo mode before connecting the real incident entities:

```yaml
type: custom:emergency-orbit-map-card
title: Emergency Orbit Test

region:
  mode: home
  label: Macarthur
  radius_km: 40

map:
  height: 520
  overview_pitch: 42
  overview_bearing: -18
  incident_pitch: 58
  incident_zoom: 14

camera:
  orbit: true
  orbit_duration: 22000
  auto_return: false

demo_mode: true
```

During startup the card should briefly show:

```text
Loading worker-free map engine…
Card 0.2.0-alpha
```

It should then display four simulated incidents around the Home Assistant location.

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
  overview_pitch: 42
  overview_bearing: -18
  incident_pitch: 58
  incident_zoom: 14

camera:
  orbit: true
  orbit_duration: 22000
  fly_duration: 3.2
  auto_return: true
  auto_return_delay: 30000

demo_mode: false
```

## Features

- Worker-free map renderer.
- Home, custom-centre and explicit-bounds region modes.
- Direct monitoring of the nearby-incidents attribute.
- Generated geolocation entity support.
- New-incident and warning-escalation focus.
- Point markers and supplied GeoJSON or polygon geometry.
- WKT polygon support.
- Cinematic fly-in and helicopter-style orbit.
- Automatic return to the regional overview.
- Home-inside-polygon warning state.
- Demo mode for installation testing.

## Region modes

### Home Assistant location

```yaml
region:
  mode: home
  label: Macarthur
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

## Custom raster tiles

The default basemap uses CARTO's dark raster tiles. It can be changed:

```yaml
map:
  tile_url: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
  tile_attribution: "&copy; OpenStreetMap contributors"
  tile_subdomains: abc
```

## Supported incident coordinates

The card accepts coordinates from:

```text
latitude / longitude
lat / lon
lat / lng
coordinates
location
```

It checks incident geometry under:

```text
geojson
geometry
polygon / polygons
boundary / boundaries
perimeter
area
```

Supported geometry includes GeoJSON features and collections, nested polygon coordinate arrays and basic WKT `POLYGON((...))` strings.

## Troubleshooting

1. Redownload the repository through HACS.
2. Restart Home Assistant.
3. Hard-refresh with `Ctrl + F5`.
4. Confirm the loading screen says `Card 0.2.0-alpha`.
5. Use `demo_mode: true` to separate map loading from live entity-data problems.
6. Check the browser console for entries beginning with `[emergency-orbit-map-card]`.

If the screen still says `Starting CSP-safe map canvas`, Home Assistant is serving the obsolete MapLibre build from cache. Change the resource URL to include `?v=0.2.0` and reload again.

## External services

The card loads Leaflet JavaScript and CSS from jsDelivr with an unpkg fallback. The default raster tiles come from CARTO and use OpenStreetMap data. Custom tile services can be configured through YAML.

## License

MIT
