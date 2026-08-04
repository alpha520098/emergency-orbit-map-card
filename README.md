# Emergency Orbit Map Card

A Home Assistant dashboard card that shows live emergency incidents with a cinematic **CSS 3D orbit**, animated **home beacon**, and support for the [ABC Emergency](https://github.com/troykelly/homeassistant-abcemergency) integration.

**Version:** `0.3.0`

## Features

- Uses your Home Assistant **home location** as the map centre
- Animated pulsing **beacon** for home (turns red when inside an active polygon)
- CSS 3D pitched view + orbit around new / escalated incidents
- Configurable ABC Emergency entities (works for any user)
- Demo mode so you can test without the integration
- Incident card with severity colours and distance
- Auto-return to regional overview after orbit

## Installation (HACS)

1. Open **HACS → Dashboard**
2. Three-dot menu → **Custom repositories**
3. Add:

```text
https://github.com/alpha520098/emergency-orbit-map-card
```

4. Category: **Dashboard**
5. Install **Emergency Orbit Map Card**
6. Restart Home Assistant
7. Hard-refresh the browser (`Ctrl + Shift + R`)

Resource path after install:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js
```

## Quick start – Demo mode

```yaml
type: custom:emergency-orbit-map-card
title: Emergency Orbit Test
demo_mode: true
region:
  mode: home
  label: My Area
  radius_km: 40
map:
  height: 520
camera:
  orbit: true
  auto_return: true
```

This generates sample incidents around your Home Assistant home location so you can test the fly-to and orbit.

## Live ABC Emergency configuration

Replace the entity IDs with the ones from your own ABC Emergency integration:

```yaml
type: custom:emergency-orbit-map-card
title: Emergency Map

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
  incident_pitch: 58
  incident_zoom: 13.5

camera:
  orbit: true
  orbit_duration: 18000
  fly_duration: 2.8
  auto_return: true
  auto_return_delay: 4000

demo_mode: false
```

## Region options

### Use Home Assistant home location (default)

```yaml
region:
  mode: home
  label: My Area
  radius_km: 40
```

### Custom centre

```yaml
region:
  mode: custom
  label: Newcastle
  latitude: -32.9283
  longitude: 151.7817
  radius_km: 50
```

## Camera options

```yaml
camera:
  orbit: true                 # enable CSS 3D orbit
  orbit_duration: 18000       # ms
  fly_duration: 2.8           # seconds
  auto_return: true
  auto_return_delay: 4000     # ms after orbit finishes
```

## Display options

```yaml
display:
  show_home_beacon: true
  show_incident_card: true
  show_clear_state: true
```

## Troubleshooting

1. Redownload the card in HACS
2. Restart Home Assistant
3. Hard-refresh the browser
4. Check the console for lines starting with `[emergency-orbit-map-card]`
5. Start with `demo_mode: true` to confirm the map loads

If the map stays on the loading screen, temporarily change the resource URL to:

```text
/hacsfiles/emergency-orbit-map-card/emergency-orbit-map-card.js?v=0.3.0
```

## License

MIT
