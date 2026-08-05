# Incident filters

Emergency Orbit 3D alpha.3 adds runtime incident type and alert level filters.

## Deployment resource

Add or replace the Home Assistant dashboard resource with the latest pinned module URL shown in the release/deployment instructions. Resource type: **JavaScript module**.

## Filter configuration

```yaml
filters:
  enabled: true
  remember_selection: true
  fit_on_change: true
  storage_key: macarthur-emergency-map

  categories:
    weather: true
    fire: true
    flood: true
    mva: true
    rescue: true
    other: true

  severity:
    information: true
    advice: true
    watch_and_act: true
    emergency_warning: true
```

## Interface

The Operational Picture panel contains two filter groups:

- Incident type: All, Weather, Fire, Flood, MVA, Rescue and Other
- Alert level: All, Info, Advice, Watch and Warning

Each chip shows the number of matching incidents in the currently loaded local/NSW scope. Filters affect map markers, the incident list, automatic focus and overview bounds.

With `remember_selection: true`, the browser stores the selected filters for that card. Set an explicit `storage_key` when multiple cards should keep separate filter selections.

## Category matching

Classification uses incident type, headline, alert text, location and status. Agency/source names are not used, preventing incidents handled by Fire and Rescue NSW from being incorrectly classified as fires solely because of the agency name.
