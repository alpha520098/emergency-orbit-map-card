Emergency Orbit Map Card



A Home Assistant dashboard card that renders live emergency incidents on a pitched 3D map, flies to new or escalated incidents, displays supplied incident polygons, and performs a controlled helicopter-style orbit.

This initial release is designed around the entity structure produced by the ABC Emergency Home Assistant setup used during development, while keeping the entity IDs, region, map and camera behaviour configurable.

Current status

Version: 0.1.0 alpha

The camera, region selection, markers, severity display, incident queue and live Home Assistant updates are implemented. The incident adapter accepts several common point and polygon formats because emergency feeds have a charming tendency to rename geometry whenever nobody asked them to.

The card currently loads MapLibre GL JS 6.1.0 from jsDelivr at runtime. Home Assistant therefore needs internet access to that CDN and to the configured map tile services. A later build can bundle MapLibre for a more self-contained release.

Features

Uses Home Assistant's configured home coordinates by default.

Supports home, custom and bounds region modes.

Watches incident attributes directly rather than waiting for a separate active binary sensor.

Reacts to new incident IDs and warning-level escalation.

Displays point markers immediately when coordinates arrive.

Adds or updates incident polygons when geometry arrives later.

Sorts incidents by home-inside-polygon, severity and distance.

Cinematic fly-in and one controlled orbit.

Optional automatic return to the regional overview.

Manual previous, next, orbit and overview controls.

Terrain, dark basemap and responsive incident panel.

Demo mode for installation testing.

Installation through HACS as a custom repository

Create a public GitHub repository named exactly:

emergency-orbit-map-card

Upload the contents of this project to that repository. Keep the committed file:

dist/emergency-orbit-map-card.js

In Home Assistant, open HACS → Dashboard.

Open the three-dot menu and choose Custom repositories.

Add your GitHub repository URL and select Dashboard as the category.

Install Emergency Orbit Map Card.

Reload Home Assistant and hard-refresh the browser if HACS has not already added the resource.

HACS expects the JavaScript filename to match the repository name. Do not rename either one unless both are changed together.

Manual installation

Copy:

dist/emergency-orbit-map-card.js

to:

/config/www/emergency-orbit-map-card.js

Add this dashboard resource:

/local/emergency-orbit-map-card.js

Set its type to JavaScript module.

Basic configuration

type: custom:emergency-orbit-map-card
title: Macarthur Emergency Map

entities:
  incidents: sensor.abc_emergency_home_nearby_incidents
  nearest: sensor.abc_emergency_home_nearest_incident
  active: binary_sensor.abc_emergency_home_active_alert
  inside_polygon: binary_sensor.abc_emergency_home_inside_polygon
  highest_level: sensor.abc_emergency_home_highest_alert_level

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
  auto_return: true
  auto_return_delay: 30000

The card reads the Home Assistant instance coordinates from:

hass.config.latitude
hass.config.longitude

unless home.latitude and home.longitude are explicitly configured.

Test before using live data

type: custom:emergency-orbit-map-card
region:
  mode: home
  label: Test region
  radius_km: 40
demo_mode: true

Demo mode generates four sample incidents inside the selected region. It does not use or modify Home Assistant entities.

Region modes

Home-centred region

region:
  mode: home
  label: Macarthur
  radius_km: 40

Custom centre and radius

region:
  mode: custom
  label: Newcastle and Lower Hunter
  latitude: -32.9283
  longitude: 151.7817
  radius_km: 50

Explicit bounds

region:
  mode: bounds
  label: Defined operational area
  north: -33.85
  south: -34.25
  east: 151.05
  west: 150.50

The visual region does not change the radius used by the upstream emergency integration. Match the map coverage to the incident feed coverage or the outer part of the map may correctly display nothing, which is less exciting but technically honest.

Configuration reference

entities

Option

Default

Purpose

incidents

sensor.abc_emergency_home_nearby_incidents

Primary incident array and generated entity ID source

nearest

sensor.abc_emergency_home_nearest_incident

Fallback incident when the nearby array is temporarily empty

active

binary_sensor.abc_emergency_home_active_alert

Secondary active-state confirmation

inside_polygon

binary_sensor.abc_emergency_home_inside_polygon

Highlights the home marker when active

highest_level

sensor.abc_emergency_home_highest_alert_level

Reserved for additional fallback behaviour

map

Option

Default

Purpose

height

520

Card height in pixels

style_url

OpenFreeMap dark style

MapLibre style URL

terrain

true

Enable 3D terrain

terrain_url

AWS Terrarium tiles

Raster DEM tile URL

terrain_exaggeration

1.35

Terrain height multiplier

overview_pitch

50

Regional camera pitch

overview_bearing

-18

Regional camera bearing

incident_pitch

62

Incident camera pitch

incident_zoom

14.2

Point-incident zoom

max_incident_zoom

15.8

Polygon and point zoom cap

maplibre_script_url

jsDelivr MapLibre 6.1.0

Optional runtime override

maplibre_css_url

jsDelivr MapLibre 6.1.0 CSS

Optional runtime override

camera

Option

Default

Purpose

orbit

true

Enable automatic orbit

orbit_duration

22000

Orbit duration in milliseconds

orbit_turns

1

Number of turns per orbit

fly_duration

3600

Fly-in duration in milliseconds

auto_return

true

Return to overview automatically

auto_return_delay

30000

Delay after orbit in milliseconds

focus_on_load

true

Focus the highest-priority existing incident after loading

refocus_on_escalation

true

Refocus when an incident warning level increases

display

display:
  show_controls: true
  show_region: true
  show_home: true
  show_incident_panel: true
  show_clear_state: true
  hide_non_urgent: true
  hide_when_clear: false
  fit_all_when_clear: false

Supported incident data

The primary entity is expected to expose:

attributes:
  incidents:
    - id: incident-id
      event_type: Bushfire
      alert_level: severe
      headline: Example incident
      distance_km: 12.4
  entity_ids:
    - geo_location.example_incident

Generated geo-location entities can provide point coordinates through any of:

latitude / longitude
lat / lon
lat / lng
coordinates
location

The adapter looks for polygon or geometry data under:

geojson
a geometry object
polygon / polygons
boundary / boundaries
perimeter
area
coordinates

Accepted geometry formats include:

GeoJSON FeatureCollection

GeoJSON Feature

GeoJSON geometry objects

Nested coordinate arrays

JSON strings containing those formats

Basic WKT POLYGON((...))

Both [longitude, latitude] and obvious Australian [latitude, longitude] coordinate pairs are normalised.

Update behaviour

The card signature includes:

The primary incident sensor state and attributes.

Every configured supporting entity.

Every generated entity listed under entity_ids.

This means a newly created incident, delayed geolocation entity, polygon update or status change can update the card without waiting for the separate active-alert binary sensor.

The cinematic camera only retriggers for:

A new incident ID.

An increased warning level.

Initial loading when focus_on_load is enabled.

A marker or control selected by the user.

Routine headline and status changes update the panel without restarting the orbit.

Privacy and external services

By default the browser requests:

MapLibre JavaScript and CSS from jsDelivr.

Vector map tiles from OpenFreeMap.

Terrain elevation tiles from the AWS Open Terrain Tiles dataset.

Those services can see normal web-request information such as the requesting IP address. Replace the URLs with self-hosted services when local-only operation is required.

Debugging

Enable browser-console diagnostics:

debug: true

Useful checks:

Confirm the incidents attribute is an array.

Confirm entity_ids contains the generated geo-location entities.

Confirm at least one incident or generated entity exposes coordinates.

Check the browser console for map tile, WebGL or CDN errors.

Use demo_mode: true to separate map problems from entity-data problems.

Development

The release file is committed under dist/, so HACS can install directly from the default branch or a GitHub release.

npm run check
npm run build

The current build script copies the source file into dist/. A later release can replace this with a bundler while preserving the same HACS filename.

Release checklist

Update CARD_VERSION in the source.

Update package.json.

Run npm run check and npm run build.

Commit the updated dist/emergency-orbit-map-card.js.

Confirm the HACS validation workflow passes.

Create a full GitHub release, not merely a tag.

Refresh the custom repository in HACS and install the release.

License

MIT
