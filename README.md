# mass-crash-map

Live map https://picturedigits.github.io/mass-crash-map

Interactive map of crashes involving vulnerable roadway users (pedestrians, cyclists, others) and motorists for various regions in Massachusetts. Python notebooks clean and merge data from public sources in CSV format, which LeafletJS code displays as heatmap clusters or symbol map points.

## Map features
- Zoom level automatically shifts from heatmap clusters to symbol points
- Mobile-first design for small screens, with arrow to expand legend
- Copy browser link to share your view of the map (location, zoom level, data layer) with others
- Filter by crash type (involving pedestrians, cyclists & micromobility users, other vulnerable users, or motorists only)
- Filter by date range (2021 onward), severity (with fatalities, or with any injury), and interstate highway (for MassDOT data only)
- Click symbol points for popup info about specific crashes

![](misc/interface.png)

## Credits
- Map design by [Jack Dougherty](https://jackdougherty.org) and [Ilya Ilyankou](https://ilyankou.com) at [Picturedigits Ltd](https://www.picturedigits.com) in collaboration with [BCU Labs](https://labs.bostoncyclistsunion.org) of the [Boston Cyclists Union](https://bostoncyclistsunion.org)
- Python notebook data cleaning and merging by [Boston University Spark!](https://www.bu.edu/spark/) Spring 2026 team: Abby Gualda, Alan Shao, Ethan Freshman, Konstantinos Ilias, Michelle Voong, Nicole Liu, Suhani Kapoor, and Thomas Shin. See their original work in this [BU Spark! BCU Biking repo](https://github.com/BU-Spark/ds-bcu-biking), which Jack Dougherty modified and included in the `data` folder of this repo.

## Data
We downloaded, cleaned, and merged crash data from public sources to make it easier to patterns involving vulnerable users, specifically pedestrians and cyclists/micromobility users.

- MassDOT data last updated 2026-04-30
- City of Boston Vision Zero, data last updated 2026-04-30, but only available to 2025-12-31
- Reminder: change end date in script.js line 54

| Source | Coverage | API / Endpoint |
|---|---|---|
| [Mass GeoDOT Open Data Portal](https://geodot-massdot.hub.arcgis.com/pages/open-data-portal) | Statewide | [ArcGIS FeatureServer REST API](https://gis.crashdata.dot.mass.gov/arcgis/rest/services/MassDOT) |
| [City of Boston Vision Zero](https://data.boston.gov/organization/vision-zero-boston-program) | Boston | Boston Open Data (CKAN datastore) |
| Sources not yet included |  |  |
| Cambridge Police Department | Cambridge | Cambridge Open Data (Socrata) |
| Somerville Police Department | Somerville | Somerville Open Data (Socrata) |

DISCLAIMER from [MassDOT Impact crash data site](https://apps.crashdata.dot.mass.gov/cdp/home): "MassDOT makes no representation as to the accuracy, adequacy, reliability, availability or completeness of the crash records or the data collected from them and is not responsible for any errors or omissions in such records or data. Under no circumstance will MassDOT have any liability for any loss or damage incurred by any party as a result of the use of the crash records or the data collected from them...In addition, any crash records or data provided for the years after 2022 are subject to change at any time and are not to be considered up-to-date or complete. As such, open years’ of crash data are for informational purposes only and should not be used for analysis..."

DISCLAIMER from City of Boston Vision Zero.... to come

- Data for 5 regions across state from MassDOT crash database, plus Boston core region (TESTING) that integrates data from MassDOT and local government sources (City of Boston Vision Zero/Emergency Medical Services; Cambridge Police Department; Somerville Police Department)

Key CSV fields used:
- `lat`, `lng` for map position
- `date`, `time` for crash timestamp
- `severity`, `pedestrian`, `cyclist`, `other`, `interstate` for filters
- `source`, `muni`, `police` for popup details





## Boston Core Data: Merge and Clean with BU Spark!

Data science students from [Boston University Spark!](https://www.bu.edu/spark/) worked with us in Spring 2026 to create code to collect, clean, standardize, and de-duplicate crashes in four municipalities we define as the "Boston core" region: **City of Boston, Brookline, Cambridge, and Somerville**. See details about their work in the [BU Spark! GitHub project repository](https://github.com/BU-Spark/ds-bcu-biking).

We decided to de-duplicate and merge data from four distinct public data sources because each contained data that did not appear in the other. Although MassDOT crash data is the most comprehensive, we found significant numbers of crashes in municipal datasets that did not appear in the MassDOT statewide records. **TODO: clarify differences** For our Boston core region, we compared four public crash data sources listed below. (Since Brookline does not maintain a public crash repository, all crashes in Brookline came solely from the MassDOT dataset.)

| Source | Coverage | API / Endpoint |
|---|---|---|
| MassDOT Open Data Portal | Statewide crashes | ArcGIS FeatureServer REST API |
| City of Boston Vision Zero | Boston crashes | Boston Open Data (CKAN datastore) |
| Cambridge Police Department | Cambridge crashes | Cambridge Open Data (Socrata) |
| Somerville Police Department | Somerville crashes | Somerville Open Data (Socrata) |

BU Spark! students created a Jupyter Notebook of Python code in this repository, called `boston-core-merge-clean.ipynb`, which collects, cleans, standardizes, and de-duplicates crash records for the Boston core region from the four public data sources above. Since MassDOT and municipal crash records exist on separate platforms with no common ID numbers, we defined crashes as highly-likely duplicates if they shared a similar location (within 100 meters) during a shared 60-minute period (**TODO ILLUSTRATE**). The code output is a unified crash dataset that appears **only** in the Boston core region of this map (not the Boston metro region, which shows MassDOT data alone).  

### Steps in Boston Core Data Merge and Clean

#### 1. Data Collection
Each source is pulled via paginated API requests (batches of 2,000–5,000 records). All four sources are collected into separate DataFrames (`mass_crashes`, `bvz_crashes`, `ca_crashes`, `so_crashes`).

#### 2. Type Standardization
Across all sources, date/time columns are converted to `datetime` types and latitude/longitude columns are cast to `float64`. Source-specific column names (e.g., `dispatch_ts`, `dtcrash`) are renamed to a common schema (`CRASH_DATE`, `CRASH_TIME`, `LAT`, `LON`, `CITY_TOWN_NAME`).

#### 3. Feature Engineering
New standardized columns are derived from each source's raw fields:

- **`CYCLIST`** — `1` if a cyclist was involved (keywords: `Cyclist`, `Bicyclist`, `Bicycle`), else `0`
- **`PEDESTRIAN`** — `1` if a pedestrian was involved (keywords: `Pedestrian`, `Non-Motorized Wheelchair`, `Roller Skater`), else `0`
- **`OTHER`** — `1` if another vulnerable road user was involved (moped, skateboarder, scooter, etc.), else `0`
- **`SEVERITY`** — `1` for fatal injury, `2` for non-fatal injury, `0` otherwise (MassDOT only)
- **`INTERSTATE`** — `1` if the crash occurred on an interstate, else `0` (MassDOT only)

#### 4. Merging
All four standardized DataFrames are concatenated into a single unified crash DataFrame with a `SOURCE` column tracking the origin of each record.

#### 5. Duplicate Detection
Because the same crash may appear in both MassDOT and a municipal dataset, a custom deduplication algorithm identifies cross-source duplicate pairs:

- Records are sorted by datetime and compared within a sliding time window
- Spatial distance is computed using an approximate Euclidean formula (converted to meters)
- A **confidence score** (0–1) is computed as `0.7 × spatial_score + 0.3 × time_score`, prioritizing spatial proximity
- Thresholds are tested across a grid of time (2, 10, 30, 60 min) and distance (5, 30, 50, 100 m) values
- **Chosen thresholds:** 60 minutes, 100 meters
- When duplicates are found, **MassDOT records are preferred** and the municipal record is dropped

##### 6. Outputs
Create 3 files in `/data` folder:
* boston-core-all-merged.csv - contains ALL MERGED crash records from different sources, including duplicates
* boston-core-duplicates-removed.csv - contains DUPLICATES REMOVED and displayed as side-by-side pairs of matched crash records for easy comparison
* boston-core.csv - contains CLEANED data, after duplicates removed, with one instance for each crash, prioritizing MassDOT data because it is more comprehensive

#### Jupyter Notebook Dependencies

```
pandas
numpy
requests
matplotlib
```

Install via:
```bash
pip install pandas numpy requests matplotlib
```

Run on local computer:
```bash
pip install jupyterlab
```

Launch on local computer:
```bash   
jupyter lab    
```

#### Known Limitations & Notes of Boston core data merger
- **Cambridge PD geocoding:** ~16,911 Cambridge crash records have street addresses but no latitude/longitude. Geocoding these requires a Google Cloud API key (estimated cost ~$200). Commented-out code using `googlemaps` is included at the bottom of the notebook for future use.
- **Duplicate detection runtime:** The nested-loop duplicate finder is O(n²) in the worst case. It is optimized by sorting on datetime and breaking early, but may be slow on very large datasets.
- **Time unreliability:** Time data across sources varies in precision and reliability. This is why spatial proximity is weighted more heavily (0.7) than time proximity (0.3) in the confidence score.

### Run map on your local computer
- Requires python3
- Serve the repo as a static site, then open `index.html`.
- Example: type in your terminal:
```bash
python3 -m http.server 8000
```
- Then visit `http://localhost:8000`.
- Note: it will only work by double-clicking if the CSV is located on a remote server, not a local file.

## License

GNU General Public License v3.0
