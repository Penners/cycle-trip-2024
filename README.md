# Flanders → Holland · Cycle Trip 2024

An interactive map of an April 2024 bike tour around the Low Countries: Bristol → Dover by train, ferry to Dunkirk, then Bruges, Antwerp, Brabant, Arnhem, Utrecht, Gouda, Delft and the Zeeland coast, and back via Bruges and Dunkirk. It has day-by-day routes, overnight pins, an elevation profile, and train and ferry legs drawn differently from the riding.

Built on the same framework as [cycle-tour-2026](https://github.com/Penners/cycle-tour-2026) (Next.js App Router, Leaflet and free, keyless basemaps).

## Run it

```sh
npm install
npm run dev
```

## The data problem, and how it's handled

The rides were recorded with Google Fit on a phone and exported from Google Takeout as `.tcx`. That recording is patchy:

- **Sparse fixes.** On some days the phone logged a point only every few minutes, so the raw track is a set of straight lines cutting across fields.
- **Missing legs.** Plenty of riding wasn't recorded at all: between recordings, from campsites, to and from stations.
- **Spikes.** Single fixes that leap hundreds of metres away and back.

[scripts/tracks.mjs](scripts/tracks.mjs) repairs this before anything is drawn:

1. It parses every *Biking* activity (Google splits a recording into Biking and Walking activities) and drops spikes.
2. It treats any two consecutive fixes more than 250 m apart as a *jump* and re-routes them along real cycle paths with [BRouter](https://brouter.de) (trekking profile), using the recorded fixes as waypoints.
3. It builds each day as a time-ordered chain of last night's stay → rides → trains and ferries → tonight's stay. Any gap between one link's end and the next one's start must have been cycled, so it becomes an **unrecorded ride**, routed the same way. A gap over 20 km is reported, not guessed: it usually means a train or ferry is missing from the config.
4. Recorded stretches and routed fill-ins are joined into one continuous ride for each run of riding between trains and ferries. The site draws them as a single route. To see what was actually recorded, run `npm run dev` and turn on **Show raw GPS** on the map (it's dev-only: the public site neither shows the button nor ships the raw data).

If BRouter's answer is a silly detour (more than 3× the straight-line distance), the build falls back to the straight line.

## How it fits together

```
gpxdata/*.tcx ─► tracks.mjs ─► npm run data:routes ─► data/routes/*.json  (BRouter bike routes, cached)
tour.config.mjs ─► npm run data:rail ─► data/rail/*.json                  (train lines along real railways)
photos/*.jpg ─► npm run data:photos ─► public/photos/ + data/photos.json

gpxdata + data/* + content/captions.json ─► npm run data ─► src/data/tour.json
content/journal.md ─► read at build time, split into days
```

| Path | What it is | Edit by hand? |
| --- | --- | --- |
| [scripts/tour.config.mjs](scripts/tour.config.mjs) | Overnight stays, train and ferry legs (with approximate times), day titles | ✅ |
| [content/journal.md](content/journal.md) | The write-up, one `### **Thursday, 4 April 2024**` section per day | ✅ |
| [content/captions.json](content/captions.json) | Photo captions, plus `"hidden": true` to leave a photo out | ✅ |
| `gpxdata/` | Raw Google Fit TCX exports (tracked, as they were already in this repo's history) | ❌ |
| `data/` | Cached bike and rail routes and generated photo metadata | ❌ |
| `src/data/tour.json` | Generated; what the site loads | ❌ |

## Correcting a guess

The routed fill-ins are only as good as what the config knows. If part of a route is wrong (compare it against **Show raw GPS** under `npm run dev`):

- **It was a train or ferry, not a ride:** add it to `transfers` with `depart`/`arrive` times. The gap around it is then routed to and from the station or port instead.
- **It took the wrong road:** the fastest fix is a photo taken along the way. Otherwise, add an intermediate waypoint (ask an assistant to add `via` support for bridges in `tracks.mjs`).
- **The stay is wrong:** fix its coordinates in `stays`. The first and last legs of each day are routed from and to it.

Then rebuild:

```sh
npm run data:routes   # fetches only routes not already cached (re-run if rate-limited)
npm run data:rail     # only when train legs change
npm run data          # assemble src/data/tour.json
```

## Weather

`npm run data:weather` fetches hourly historical weather from the free [Open-Meteo archive](https://open-meteo.com/en/docs/historical-weather-api) (ERA5 reanalysis, about 25 km grid squares) for every grid square the route and stays touch, and caches it in `data/weather.json`. [scripts/weather.mjs](scripts/weather.mjs) turns it into each day's:

- **Temperatures:** the daytime high, and the overnight low at that night's stay.
- **Rain, wind and gusts:** rain while riding, and the wind speed, direction and gusts.
- **Headwind:** the wind component along your direction of travel, sampled every minute of riding. It's positive into your face, and negative (shown as tailwind) behind you.
- **Cloud and sunshine:** cloud cover and hours of sunshine while riding. Thin high cloud reads as "100% cloud" but lets the sun through, which is how you burn on a grey day.

## Photos

Copy the phone photos into `photos/` (git-ignored) and run `npm run data:photos`, then `npm run data`. Captions, and `"hidden": true` for duplicates and misfires, live in [content/captions.json](content/captions.json).

- **Filenames:** Pixel `PXL_YYYYMMDD_HHMMSSmmm` (UTC) and Motorola-style `IMG_YYYYMMDD_HHMMSSmmm` both work. `IMG_` times are the camera's own clock, which switched from UK to continental time on landing in Dunkirk. `CAMERA_CLOCK` in `tour.config.mjs` records when, checked against landmarks in the photos.
- **Location:** taken from EXIF GPS. A photo without GPS is placed where the track was when it was taken, from rides, walks or the routed fill-ins.
- **Videos:** the two `.mp4` clips are ignored, as the site only shows stills.

Photos are the best evidence for checking the routed fill-ins, since a photo far from its day's line means the guess went the wrong way. Under `npm run dev`, the **Show raw GPS** toggle on the map overlays exactly what the phone recorded: a thin purple line through every fix, walks dotted, and a dot with its time at either end of every jump.

## Basemaps

All free with no API key: OpenFreeMap (Streets / Light / Dark, vector tiles via MapLibre GL), CyclOSM, OpenTopoMap and Esri satellite. See [src/lib/tiles.ts](src/lib/tiles.ts).
