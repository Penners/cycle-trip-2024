// Fetches hourly historical weather (Open-Meteo archive, ERA5 reanalysis:
// free, no key) for every 0.25° grid cell the route or a stay touches,
// and caches it in data/weather.json. build-data.mjs turns it into each
// day's high, overnight low, wind and headwind.
// Re-run only when the route changes: `npm run data:weather`.
import fs from "node:fs";
import { stays } from "./tour.config.mjs";
import { buildTracks } from "./tracks.mjs";
import { GRID, cellOf } from "./weather.mjs";

const cells = new Set(stays.map((s) => cellOf(s.lat, s.lon)));
for (const t of buildTracks()) for (const p of t.pts) cells.add(cellOf(p.lat, p.lon));

const dates = buildTracks().map((t) => t.date).sort();
const start = dates[0];
// One extra day so the last night's low (into the next morning) is covered.
const end = new Date(new Date(dates.at(-1)).getTime() + 86400e3).toISOString().slice(0, 10);
const HOURLY = ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "precipitation", "cloud_cover", "shortwave_radiation", "sunshine_duration"];

const list = [...cells].sort();
console.log(`${list.length} grid cells, ${start} → ${end}`);
const out = { start, grid: GRID, hourly: HOURLY, cells: {} };
// The API takes many locations per request; keep each request modest.
for (let i = 0; i < list.length; i += 20) {
  const batch = list.slice(i, i + 20).map((c) => c.split(",").map(Number));
  const url =
    "https://archive-api.open-meteo.com/v1/archive" +
    `?latitude=${batch.map((c) => c[0]).join(",")}&longitude=${batch.map((c) => c[1]).join(",")}` +
    `&start_date=${start}&end_date=${end}&hourly=${HOURLY.join(",")}&timezone=UTC&wind_speed_unit=kmh`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let json = await res.json();
  if (!Array.isArray(json)) json = [json];
  json.forEach((loc, k) => {
    // Hour h of the series is start + h hours (UTC); store columns compactly.
    out.cells[list[i + k]] = Object.fromEntries(HOURLY.map((v) => [v, loc.hourly[v]]));
  });
  await new Promise((r) => setTimeout(r, 1000));
}
fs.writeFileSync("data/weather.json", JSON.stringify(out));
console.log(`✓ data/weather.json (${(fs.statSync("data/weather.json").size / 1024).toFixed(0)} KB)`);
