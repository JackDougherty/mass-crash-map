# mass-crash-map

Interactive Massachusetts crash map built with Leaflet.

![](misc/interface.png)

It loads crash records from CSV and supports:

- Date range filtering
- Crash type filters (pedestrian, cyclist, motorists only)
- Injury severity filters
- Roadway filters (all, local/state, interstate)
- Planning region (`rpa`) filter with `MAPC` default
- Heatmap and point views with popups

## Run locally

Serve the repo as a static site, then open `index.html`.

Example:
```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

(Note: it will only work by double-clicking if the CSV is located on a remote server, not a local file.)

## Data

Current data file: `data/crash-mapc-2024.csv`

Key CSV fields used:
- `lat`, `lng` for map position
- `date`, `time` for crash timestamp
- `severity`, `pedestrian`, `cyclist`, `interstate` for filters
- `rpa` for planning region filtering
- `source`, `muni`, `police` for popup details

## License

MIT.