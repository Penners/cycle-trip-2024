// Routes every gap tracks.mjs finds (sparse jumps inside rides, and the
// unrecorded rides between them) along real cycle paths using BRouter's
// "trekking" profile, caching each result in data/routes/.
// Only fetches what isn't cached (or previously failed): `npm run data:routes`.
import fs from "node:fs";
import { planTracks, cacheFile, ROUTE_DIR } from "./tracks.mjs";

fs.mkdirSync(ROUTE_DIR, { recursive: true });
const { requests, bridges, warnings } = planTracks();
for (const w of warnings) console.warn(`⚠ ${w}`);
const cached = (lonlats) => fs.existsSync(cacheFile(lonlats)) && JSON.parse(fs.readFileSync(cacheFile(lonlats), "utf8")).coords;
const todo = requests.filter((lonlats) => !cached(lonlats));
console.log(`${requests.length} routes needed (${bridges.length} unrecorded legs), ${todo.length} to fetch`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One BRouter request: { ok, coords, km } | { retry } | { error }. */
async function query(lonlats) {
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`;
  await sleep(2500); // be gentle with the public server
  let text;
  try {
    text = await (await fetch(url)).text();
  } catch (e) {
    return { retry: `network error: ${e.message}` };
  }
  if (/retry later/i.test(text)) {
    await sleep(30000);
    return { retry: "rate limited" };
  }
  try {
    const feature = JSON.parse(text).features[0];
    return {
      ok: true,
      km: +(feature.properties["track-length"] / 1000).toFixed(2),
      coords: feature.geometry.coordinates.map(([lon, lat, ele]) => [+lat.toFixed(5), +lon.toFixed(5), ele != null ? +(+ele).toFixed(1) : null]),
    };
  } catch {
    return { error: text.slice(0, 120) };
  }
}

// A waypoint inside a campsite or on a private yard can be a "target
// island" BRouter can't reach. Nudge the end points towards each other
// (150 m, then 400 m) until one connects to the network.
function nudged(lonlats, m) {
  const pts = lonlats.split("|").map((s) => s.split(",").map(Number));
  const move = (a, b) => {
    const d = Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 111320;
    const f = Math.min(m / d, 0.45);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const out = [...pts];
  out[0] = move(pts[0], pts[1]);
  out[out.length - 1] = move(pts.at(-1), pts.at(-2));
  return out.map(([lo, la]) => `${lo.toFixed(5)},${la.toFixed(5)}`).join("|");
}

for (const [n, lonlats] of todo.entries()) {
  let res = await query(lonlats);
  for (const m of [150, 400]) {
    if (!res.error) break;
    res = await query(nudged(lonlats, m));
  }
  if (res.retry) {
    console.error(`✗ ${res.retry}, will retry next run`);
    continue;
  }
  if (res.error) console.error(`✗ ${lonlats.slice(0, 60)}…: ${res.error}`);
  // Cached even when unroutable, so the build falls back to the straight line.
  fs.writeFileSync(cacheFile(lonlats), JSON.stringify({ lonlats, km: res.km ?? null, coords: res.coords ?? null }));
  if ((n + 1) % 20 === 0) console.log(`  ${n + 1}/${todo.length}`);
}
console.log("✓ routes cached in data/routes/");
