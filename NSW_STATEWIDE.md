# NSW-wide incident toggle

Emergency Orbit 3D alpha.2 can switch between local incidents and the NSW-wide ABC Emergency feed.

## Resource

Add or replace the Home Assistant dashboard resource with:

```text
https://cdn.jsdelivr.net/gh/alpha520098/emergency-orbit-map-card@71be3ac4eec00467f8acadeee71d09b57dc149fc/dist/emergency-orbit-3d-card.js
```

Resource type: **JavaScript module**.

Hard-refresh Home Assistant after changing the resource.

## Card configuration

```yaml
statewide:
  enabled: true
  include_on_load: false
  total_entity: sensor.abc_emergency_new_south_wales_total_incidents
  highest_level_entity: sensor.abc_emergency_new_south_wales_highest_alert_level
  entity_prefixes:
    - geo_location.abc_emergency_new_south_wales_
    - geo_location.abc_emergency_nsw_
  exclude_prefixes:
    - geo_location.abc_emergency_home_
  auto_focus: true
  auto_focus_level: extreme
  fit_overview: true
  fit_on_toggle: true
```

The **NSW-wide incidents** switch is off by default. With it off, the card shows only the configured Home/local feed. With it on, the card discovers matching NSW `geo_location` incident entities, removes likely duplicates of local incidents, and expands Overview to include the statewide markers.

Statewide markers are smaller and labelled NSW. Local markers remain visually dominant. New statewide incidents only take camera focus automatically at Emergency Warning level by default.
