# AsiaWX

Asia-focused weather analysis workstation. Phase 1 delivers a MapLibre map of Asia and the Western Pacific, GPU-independent animated 10 m wind particles driven by real model vector fields, a synchronized forecast timeline, point forecasts with meteograms, model switching, place search, and a source-health panel. Nothing is simulated: if a provider fails the interface says so.

## Status

Built in phases. This repository contains Phase 1 only.

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
