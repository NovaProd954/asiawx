# AsiaWX

Asia-focused weather analysis workstation. Phase 1 delivers a MapLibre map of Asia and the Western Pacific, GPU-independent animated 10 m wind particles driven by real model vector fields, a synchronized forecast timeline, point forecasts with meteograms, model switching, place search, and a source-health panel. Nothing is simulated: if a provider fails the interface says so.

## Status

Built in phases. This repository contains Phase 1, Phase 2 (satellite imagery and the Cloud Decoder) and Phase 3 (tropical cyclones and warnings).

| Area | Phase 1 |
| --- | --- |
| Map, search, geolocation, bookmarks, UTC/local, fullscreen | Done |
| 10 m wind particles from model U/V, timeline | Done |
| Point forecast, meteogram, data table, model switching (GFS, ECMWF IFS, ICON) | Done |
| Weather Decoder (wind layer), source health, attribution | Done |
| Satellite, Cloud Decoder, radar, cyclones, warnings, marine, air quality | Not built |
| Model comparison, predictability, layer compare, historical, pressure levels | Not built |
| ADM1 to ADM3 boundary tiles | Not built. The basemap boundaries come from OpenStreetMap via OpenFreeMap |
| Observations | Not built. All values shown are model output and labelled as such |

## Architecture

```
api/_om.ts       shared upstream helpers: retry with backoff, timeout, optional API key
api/grid.ts      wind grid proxy: subsets Asia, validates, returns speed/direction for 48 hourly steps
api/point.ts     single-point forecast proxy with sunrise and sunset
src/config.ts    domain bounds, model list, colour ramp, source metadata
src/data/        adapters: grid, forecast, geocode (fetch, validate, normalise)
src/lib/         wind maths, time formatting, HTTP client (timeout, retry, dedupe, cancellation, health)
src/wind/        canvas particle renderer
src/ui/          SVG meteogram and data table
src/main.ts      state, wiring, panels
```

The browser never calls a weather provider directly. Requests go to `/api/*`, where responses are cached at the edge, upstream calls are retried, and an optional paid key stays server side.

## Data providers

| Provider | Use | Terms | Attribution |
| --- | --- | --- | --- |
| Open-Meteo Forecast API | Model forecasts from NOAA GFS, ECMWF IFS open data, DWD ICON | Data CC BY 4.0; free API is for non-commercial use | Weather data by Open-Meteo.com |
| Open-Meteo Geocoding | Search, from GeoNames | CC BY 4.0 | GeoNames |
| OpenFreeMap | Vector basemap | ODbL data, OpenMapTiles schema | OpenFreeMap, OpenMapTiles, OpenStreetMap contributors |

Check each provider's current terms before commercial use.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `OPEN_METEO_API_KEY` | No | Uses Open-Meteo's customer endpoint from the serverless functions. Never exposed to the browser |

## Local development

```
npm install
npx vercel dev      # serves the app and /api functions
npm run test
npm run build
```

`npm run dev` serves only the frontend, so weather requests fail without the functions.

## Deployment

Import the repository in Vercel. The Vite preset and the `api` directory are detected automatically. Push to the production branch to deploy.

## Caching and rate limits

Wind grid responses are cached 3 hours at the edge with a 2 hour stale window. Point forecasts are cached 10 minutes. The wind grid is 27 by 16 points (432) per model, fetched in chunks of 100. The free Open-Meteo tier has a daily call allowance, so the long cache is deliberate. Heavy traffic needs `OPEN_METEO_API_KEY`.

## Scientific methodology

Wind vectors: components are u = -s sin(d) and v = -s cos(d), where s is speed in m/s and d is the meteorological direction the wind blows from. Direction is recovered as atan2(-u, -v). Particles sample the grid by bilinear interpolation in longitude and latitude. If any of the four surrounding values is missing the particle is removed; missing cells are never filled. Particle displacement per frame is proportional to local speed in screen pixels, so apparent motion scales with wind but is not real-time advection. Hourly fields are not interpolated in time.

Model run time comes from Open-Meteo's model metadata when available and is otherwise shown as not provided.

## Known limitations

- The wind field is sampled every 6 degrees, coarser than any of the models. Jets, cyclone cores, sea breezes and terrain effects are smoothed or absent. A finer grid needs direct GRIB subsetting, planned for a later phase.
- Particles are drawn on a 2D canvas, not WebGL. Density is adaptive with low, medium and high modes.
- Only 10 m wind is available as a map layer.
- Model values for past hours are model output, not observations.
- ESLint is not configured yet. Type checking and unit tests run in the build.

## Testing

`npm run test` covers wind component conversion, bilinear sampling including missing-cell and out-of-bounds behaviour, grid and forecast validation, coordinate parsing, and time formatting. `npm run build` runs the TypeScript check first.

## Phase 2: satellite and Cloud Decoder

Turn on **Layers > Satellite > Himawari-9 imagery**. The timeline switches to observation times (10 minute frames, about 4 hours); the wind follows the nearest model hour.

- `api/sat.ts` reads the NASA GIBS WMTS capabilities (EPSG:3857, best available) and returns, per layer, the tile matrix set, tile URL template and the latest frame times. Nothing about tile format or zoom is hard coded. Layers: Clean infrared Band 13, Visible red Band 3, Air Mass RGB.
- `api/cmap.ts` relays the published GIBS colormap for the infrared layer.
- Frames are shown with two alternating raster layers so the next frame is loaded before it replaces the current one.
- **Cloud Decoder** (infrared only, `src/sat/decode.ts`, runs in a web worker): pixel colours are matched to the GIBS colormap and converted to brightness temperature. Views: enhanced infrared, cold cloud mask (threshold selectable), convective candidates, overshooting-top candidates (native zoom only), 30 minute cooling rate. Each view is labelled observed, enhanced, derived or interpretive. Raw versus decoded is an opacity crossfade; a true swipe is deferred.
- Hovering shows the decoded cloud-top brightness temperature (approximate).
- If the colormap is missing or has no readable temperature labels, the decoder says so and only raw imagery is shown. Nothing is guessed.

### Not verified yet (the build container cannot reach NASA GIBS)
Real imagery, the Band 13 tile matrix set and the visible-layer format are read at runtime and have only been tested against synthetic capabilities. Check on a device: raw tiles appear, CORS allows reading tiles for the decoder, and the colormap labels are temperatures. Candidate heuristics use fixed thresholds that are not validated.

Acknowledgment (required by NASA GIBS): We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).

### Satellite providers (Phase 2.1)
`/api/sat` now builds the catalog from three independent providers, so one failing no longer disables the layer. A failed provider is listed with its reason under Layers > Satellite.
- **NASA GIBS**: Himawari-9 Clean IR, Visible and Air Mass. The catalog no longer depends on parsing the capabilities file: layers are also discovered by probing real tiles (Level6 PNG, then JPEG), and capabilities are used only when they parse. Also daily VIIRS and MODIS true colour (Level9 JPEG, last 7 days).
- **JMA Himawari-9**: Band 13 IR, Band 8 water vapour and true colour from the JMA real-time tiles. Tiles are relayed through the `/p/jma` rewrite in `vercel.json` so the browser can load them.
- **SSEC RealEarth**: hourly global IR and visible composites, including western Asia outside the Himawari disk. Loaded directly from the browser, so it needs CORS to be allowed.
Only the NASA GIBS Clean IR layer feeds the Cloud Decoder. Tile layout for JMA and RealEarth was written from their public conventions and has not been tested against the live services.

### Colormap fix (Phase 2.2)
The GIBS colormap for Himawari Clean IR is `Clean_Longwave_Infrared_Window_Band.xml` (the layer id has no file of its own, which caused the 404). `/api/cmap` now tries that name first. Its entries carry temperature as intervals such as `(-92.1,-91.1]` with units on the parent `ColorMap`, so the parser reads interval midpoints when there is no `label`. The assumption that the Himawari layer is rendered with this colormap is checked at run time: if many pixel colours do not match, the Decoder says temperatures may be unreliable.

## Phase 2.3: full-disk decode, smoother output, source-independent decoding, local frames

- **Full disk, fast.** The decoded layer no longer vanishes when you pan. A coarse decode of the whole Himawari-9 region (60E to 180E, 12S to 72N; zoom 4, about 36 tiles, under half a second in the worker for the enhanced view) is kept on the map and cached per frame, and a finer decode of the area on screen sits on top of it with a 25% margin. The full-disk zoom can be raised to 5 under Decoder > Full disk detail. Convective and overshooting-top candidates stay visible-area only, because their thresholds need fine pixels.
- **Smoother.** A small binomial filter is applied to brightness temperature before colouring (Decoder > Smoothing: Off, Light, Smooth), the decoded layer is drawn with linear resampling, windows of 16 tiles or fewer are doubled by bilinear interpolation of BT before colouring, and the cold mask has a soft edge. Candidate views use unsmoothed BT.
- **Borders on top.** Country borders, first-level borders and ocean coastlines from the basemap's vector source are redrawn above the satellite and decoded layers (Layers > Borders and coastlines above satellite). Place labels were already above.
- **Rasterise, remove background, decode.** The tiles of any product are rasterised in the browser; everything beyond the satellite limb is removed using the geometry of the sub-satellite point at 140.7E (the rim is faded); then pixels are decoded by one of three routes: the GIBS colormap (Clean IR), a brightness-to-temperature curve fitted live against the GIBS frame of the same time for grey-scale IR sources without a colormap (JMA Band 13, SSEC global IR), or brightness alone for visible products (cloud layer only, no temperature). The fit is rejected, with the reason shown, if the source is not grey-scale, does not correlate with GIBS (wrong geometry or time), or leaves more than 6 K residual. Fitted curves are kept in localStorage for 14 days; Decoder > Recalibrate refits.
- **New view: Cloud layer, background removed.** The clear-sky background is estimated per block of about 8 degrees (90th percentile of BT for infrared, 20th percentile of brightness for visible) and removed. It is interpretive, not an official cloud mask: cold surfaces and cloud shields larger than the window can be misjudged.
- **Frames kept on the device.** `public/sw.js` is a service worker that stores successful tile responses from GIBS, SSEC and the `/p/jma` relay in Cache Storage (cache-first, 2600 tiles at most, entries older than 48 hours dropped), so replays, reloads and the decoder do not hit the providers again. Layers > Save loop downloads every frame of the area on screen; Clear empties the cache. Persistent storage is requested so the browser is less likely to evict it.

### Not verified yet (the build container cannot reach GIBS, JMA or SSEC)
JMA and SSEC tile geometry, CORS for SSEC, that the JMA Band 13 tiles are grey-scale, whether the calibration passes on real tiles, the basemap source-layer names used for borders and coastlines (`boundary`, `water` with class ocean), and real-device memory at full-disk zoom 5. Failures are reported in the Decoder panel rather than hidden.

## Phase 3: tropical cyclones and warnings

```
api/_tc.ts       pure normalisers for JMA, GDACS and HKO payloads, plus great-circle helpers
api/tc.ts        proxy: fetches the three feeds, validates, matches GDACS entries to JMA systems, one status line per feed
api/tcprobe.ts   diagnostic: probes candidate JTWC and ATCF sources and reports exactly what came back
src/tc/          map controller (tracks, circles, warning areas, markers), geometry, Storms panel
```

| Feed | Use | Status in the build session |
| --- | --- | --- |
| JMA typhoon JSON (`targetTc.json`, per-system `forecast.json`, `specifications.json`) | Active systems, analysis and forecast positions, 70% probability circles, gale and storm warning areas, pressure and 10-minute wind | The list endpoint returned live data; the per-system field layout comes from public client code and is parsed defensively |
| GDACS cyclone events | Cross-check, alert level, systems JMA does not track | Returned live data, including JTWC-sourced entries |
| HKO warning summary | Warnings and signals in force for Hong Kong | Documented by HKO; not fetched in the session, so the Sources tab shows its live status |
| JTWC direct, ATCF mirrors | Not integrated | Reliability not confirmed; `/api/tcprobe` tests them from the deployed site |

Anything the feeds do not give is shown as not provided. Unrecognised warning geometry is reported in the Storms tab instead of being drawn. JMA wind is a 10-minute mean and is not comparable with JTWC 1-minute winds.

## Phase 4: comparison, predictability and history

- Compare tab: six deterministic models for one point (GFS, ECMWF IFS, ICON, JMA GSM, GEM, UK Met Office) through `/api/compare`. Each model is fetched separately; a model the provider refuses is listed as unavailable with its error, never filled in.
- Predictability: the spread between models by day, and the GEFS and ECMWF ensembles through `/api/ens` (all members reduced to percentiles and daily rain shares on the server). Only real member statistics are shown; there are no invented confidence percentages.
- Layer compare on the map: wind speed difference between two models, and a draggable split view with particles from each model.
- History tab: ERA5 reanalysis through `/api/hist` (`part=clim` for the 1991 to 2020 normals, cached 30 days; `part=recent` for the last 14 months). Anomalies, 30 and 90 day summaries, cumulative rain against normal.
- Unverified from the build sandbox (no route to Open-Meteo): the ensemble response key layout, the extra model ids, and `models=era5` on the archive API. The Sources tab and each panel report failures per model or ensemble.
