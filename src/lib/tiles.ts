// Free, keyless basemaps. OpenFreeMap serves vector tiles with no key or
// usage limits (rendered through MapLibre GL inside Leaflet); the raster
// options are free for non-commercial use with attribution.
export type TileSource =
  | { id: string; name: string; type: "vector"; style: string; attribution: string }
  | { id: string; name: string; type: "raster"; url: string; attribution: string; maxZoom: number; subdomains?: string };

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OFM = `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from ${OSM}`;

export const TILE_LAYERS: TileSource[] = [
  { id: "liberty", name: "Streets", type: "vector", style: "https://tiles.openfreemap.org/styles/liberty", attribution: OFM },
  { id: "positron", name: "Light", type: "vector", style: "https://tiles.openfreemap.org/styles/positron", attribution: OFM },
  {
    id: "cyclosm",
    name: "Cycling (CyclOSM)",
    type: "raster",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: `<a href="https://www.cyclosm.org">CyclOSM</a> | ${OSM}`,
    maxZoom: 20,
  },
  {
    id: "topo",
    name: "Terrain (OpenTopoMap)",
    type: "raster",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: `${OSM}, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    maxZoom: 17,
  },
  {
    id: "satellite",
    name: "Satellite (Esri)",
    type: "raster",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  { id: "dark", name: "Dark", type: "vector", style: "https://tiles.openfreemap.org/styles/dark", attribution: OFM },
];
