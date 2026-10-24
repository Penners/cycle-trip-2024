"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { setWorkerUrl } from "maplibre-gl";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { createElementObject, createLayerComponent, type LayerProps } from "@react-leaflet/core";

// Copied into public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type Props = LayerProps & { style: string };

/** A MapLibre GL vector basemap usable as a react-leaflet layer. */
const VectorTileLayer = createLayerComponent<L.Layer, Props>(({ style, attribution }, ctx) => {
  const layer = maplibreGL({ style, attribution } as Parameters<typeof maplibreGL>[0]);
  return createElementObject(layer, ctx);
});

export default VectorTileLayer;
