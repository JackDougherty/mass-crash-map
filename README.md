# mass-crash-map

Live map

https://picturedigits.github.io/mass-crash-map

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

More info to come about data sources and definitions...

Current default data file: `data/metro.csv`

Current time period: 01 Jan 2022 to 31 Dec 2025

Key CSV fields used:
- `lat`, `lng` for map position
- `date`, `time` for crash timestamp
- `severity`, `pedestrian`, `cyclist`, `other`, `interstate` for filters
- `source`, `muni`, `police` for popup details

## License

MIT.
