// MapLibre v6 locates its web worker relative to its own module URL,
// which breaks once Next bundles it. Serve the worker from public/
// instead (see VectorTileLayer.tsx). Runs on postinstall so the copy
// always matches the installed version.
import fs from "node:fs";

fs.mkdirSync("public/maplibre", { recursive: true });
fs.copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log("✓ copied maplibre-gl-worker.mjs to public/maplibre/");
