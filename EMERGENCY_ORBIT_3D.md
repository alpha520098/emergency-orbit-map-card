# Emergency Orbit 3D Card

**Status:** `0.1.0-alpha.1`

This is a separate Home Assistant dashboard card built with MapLibre GL JS. It does not replace the existing Leaflet card.

- Existing card: `custom:emergency-orbit-map-card`
- New 3D card: `custom:emergency-orbit-3d-card`

## Install the alpha resource

Open **Settings → Dashboards → Resources**, then add this URL as a **JavaScript module**:

```text
https://cdn.jsdelivr.net/gh/alpha520098/emergency-orbit-map-card@e6de541156119e5e777319cab9e59e61987c216b/dist/emergency-orbit-3d-card.js
```

Reload the dashboard and hard-refresh the browser.

## First test

Use demo mode before connecting live entities:

```yaml
type: custom:emergency-orbit-3d-card
title: Emergency Orbit 3D
demo_mode: true
region:
  mode: home
  label: Macarthur operational region
  radius_km: 40
map:
  height: 620
  terrain: true
camera:
  orbit: true
  orbit_duration: 22000
  orbit_turns: 1
  fly_duration: 3600
  auto_return: true
  auto_return_delay: 4500
```

## Live ABC Emergency configuration

```yaml
type: custom:emergency-orbit-3d-card
title: Emergency Orbit 3D
demo_mode: false
entities:
  incidents: sensor.abc_emergency_home_nearby_incidents
  nearest: sensor.abc_emergency_home_nearest_incident
  active: binary_sensor.abc_emergency_home_active_alert
  inside_polygon: binary_sensor.abc_emergency_home_inside_polygon
  highest_level: sensor.abc_emergency_home_highest_alert_level
region:
  mode: home
  label: Macarthur operational region
  radius_km: 40
map:
  height: 620
  terrain: true
  terrain_exaggeration: 1.35
  overview_pitch: 50
  overview_bearing: -18
  incident_pitch: 62
  incident_zoom: 14.2
camera:
  orbit: true
  orbit_duration: 22000
  orbit_turns: 1
  fly_duration: 3600
  auto_return: true
  auto_return_delay: 4500
  focus_on_load: true
  refocus_on_escalation: true
display:
  show_controls: true
  show_region: true
  show_home: true
  show_incident_panel: true
  show_clear_state: true
  show_camera_readout: true
  hide_non_urgent: true
  panel_open: true
```

## External services

The alpha build loads:

- MapLibre GL JS 5.24.0 from jsDelivr
- OpenFreeMap dark vector tiles
- AWS Terrarium elevation tiles

The browser and Home Assistant device need internet access and WebGL support. Lower-powered wall tablets may render terrain and continuous orbit less smoothly.

## Alpha limitations

- This is deployed as a second resource inside the existing repository, not yet as a separate HACS repository.
- It has passed JavaScript syntax and custom-element registration checks.
- It still requires live testing inside Home Assistant on desktop and the Companion App.
- The old Leaflet card remains available as a fallback.
