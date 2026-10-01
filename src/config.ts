export const BOUNDS:[[number,number],[number,number]]=[[25,-12],[180,80]];
export const START:[[number,number],[number,number]]=[[42,-6],[150,58]];
export interface ModelInfo{id:string;name:string;org:string;res:string;license:string}
export const MODELS:ModelInfo[]=[
{id:'gfs_seamless',name:'GFS',org:'NOAA / NCEP',res:'0.25 deg, about 28 km',license:'US Government work, public domain'},
{id:'ecmwf_ifs025',name:'ECMWF IFS',org:'ECMWF open data',res:'0.25 deg, about 28 km',license:'CC BY 4.0'},
{id:'icon_seamless',name:'ICON',org:'DWD',res:'global 0.125 deg, about 13 km over Asia',license:'CC BY 4.0'}
];
export const STYLES:Record<string,string>={light:'https://tiles.openfreemap.org/styles/positron',standard:'https://tiles.openfreemap.org/styles/bright'};
export const RAMP:[number,string][]=[[0,'#4b2a7b'],[5,'#375a8c'],[10,'#1f8a8a'],[15,'#2fa05a'],[20,'#a3a01a'],[25,'#c25a12']];
export interface SourceInfo{key:string;name:string;what:string;license:string;attribution:string;coverage:string;update:string}
export const SOURCES:SourceInfo[]=[
{key:'grid',name:'Open-Meteo Forecast API (wind grid)',what:'10 m wind speed and direction sampled every 6 degrees from the selected model, 48 hourly steps',license:'Data CC BY 4.0; free API for non-commercial use',attribution:'Weather data by Open-Meteo.com',coverage:'25E-180E, 12S-78N',update:'Model runs, typically every 6 h; cached 3 h at the edge'},
{key:'point',name:'Open-Meteo Forecast API (location forecast)',what:'Hourly single-point forecast for 5 days and sunrise/sunset',license:'Data CC BY 4.0; free API for non-commercial use',attribution:'Weather data by Open-Meteo.com',coverage:'25E-180E, 12S-80N',update:'Model runs, typically every 6 h; cached 10 min at the edge'},
{key:'geocode',name:'Open-Meteo Geocoding API',what:'Place search and autocomplete, filtered to the Asian domain',license:'CC BY 4.0',attribution:'GeoNames via Open-Meteo',coverage:'Global, filtered to Asia',update:'Continuous'},
{key:'basemap',name:'OpenFreeMap vector tiles',what:'Base map, borders and labels',license:'ODbL data, OpenMapTiles schema',attribution:'OpenFreeMap, OpenMapTiles, data from OpenStreetMap contributors',coverage:'Global',update:'Weekly planet builds'}
];
export const ACK="We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).";
SOURCES.push(
{key:'sat',name:'NASA GIBS WMTS capabilities and colormap (via AsiaWX proxy)',what:'Layer list, tile matrix set, tile URL template, available frame times and the published colormap for Himawari-9 layers',license:'Open access through NASA GIBS; check NASA and JMA terms before any commercial use',attribution:ACK,coverage:'Himawari-9 full disk',update:'Capabilities cached 2 min at the edge; colormap cached 1 day'},
{key:'gibs',name:'NASA GIBS Himawari-9 imagery tiles',what:'Colour-rendered Himawari-9 AHI Band 13 infrared, Band 3 red visible and Air Mass RGB, nominally every 10 minutes',license:'Open access through NASA GIBS with the acknowledgment shown here; underlying data from JMA Himawari-9',attribution:ACK,coverage:'Himawari-9 full disk, centred near 140.7E; Asian areas far west or at high latitude are at or beyond the view edge',update:'Nominally 10 minutes; actual latency is not measured by this build'});
