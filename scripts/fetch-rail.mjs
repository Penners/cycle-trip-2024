// Routes each train transfer along real railway lines using BRouter's
// "rail" profile and caches the result in data/rail/<id>.json.
// Re-run only when transfers change: `npm run data:rail`.
import fs from "node:fs";
import path from "node:path";
import { transfers } from "./tour.config.mjs";

const outDir = path.resolve("data/rail");
fs.mkdirSync(outDir, { recursive: true });

for (const t of transfers.filter((t) => t.mode === "train")) {
  const pts = [t.from, ...t.via, t.to];
  const lonlats = pts.map(([lat, lon]) => `${lon},${lat}`).join("|");
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=rail&alternativeidx=0&format=geojson`;
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`✗ ${t.id}: ${text.slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }
  const feature = json.features[0];
  const coords = feature.geometry.coordinates.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]);
  const km = +(feature.properties["track-length"] / 1000).toFixed(1);
  fs.writeFileSync(path.join(outDir, `${t.id}.json`), JSON.stringify({ id: t.id, km, coords }));
  console.log(`✓ ${t.id}: ${km} km, ${coords.length} points`);
  await new Promise((r) => setTimeout(r, 1000));
}
