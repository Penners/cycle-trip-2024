// Builds src/data/tour.json from the Google Health TCX exports (repaired
// by tracks.mjs), cached bike and rail routes and photo metadata. Run
// `npm run data:routes`, `npm run data:rail` and `npm run data:photos`
// first (their outputs are committed, so this only needs re-running when
// the raw data or tour.config.mjs changes).
import fs from "node:fs";
import path from "node:path";
import { stays, transfers, dayTitles, TIMEZONE_OFFSET_HOURS } from "./tour.config.mjs";
import { buildTracks, haversine, rawRecordings, localDate as localDay } from "./tracks.mjs";
import { loadWeather, dayWeather } from "./weather.mjs";

const OUT = path.resolve("src/data/tour.json");

// ---------- geometry helpers ----------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function pathLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

// Ramer–Douglas–Peucker on an equirectangular projection (fine at this scale).
function simplify(coords, toleranceM) {
  if (coords.length < 3) return coords;
  const lat0 = rad(coords[0][0]);
  const xy = coords.map(([la, lo]) => [rad(lo) * Math.cos(lat0) * R, rad(la) * R]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / len2));
      const px = x1 + t * dx - xy[i][0], py = y1 + t * dy - xy[i][1];
      const d = px * px + py * py;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceM * toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

const round = (n, dp) => +n.toFixed(dp);
const atLocal = (date, hhmm) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - TIMEZONE_OFFSET_HOURS * 3600e3).toISOString();

// Resample to fixed distance steps, smoothing altitude over a window so
// GPS noise doesn't inflate climbing.
function profileFor(pts, stepM = 100, smoothM = 300) {
  const total = pts[pts.length - 1].d;
  const out = [];
  let j = 0, lo = 0, hi = 0, sum = 0, n = 0;
  // Straight-line fallbacks have no elevation: hold the last known value.
  let last = pts.find((p) => p.alt != null)?.alt ?? 0;
  for (let x = 0; x <= total + 1e-6; x += stepM) {
    while (j < pts.length - 1 && pts[j + 1].d < x) j++;
    // sliding window [x - smoothM/2, x + smoothM/2]
    while (hi < pts.length && pts[hi].d <= x + smoothM / 2) { if (pts[hi].alt != null) { sum += pts[hi].alt; n++; } hi++; }
    while (lo < hi && pts[lo].d < x - smoothM / 2) { if (pts[lo].alt != null) { sum -= pts[lo].alt; n--; } lo++; }
    const p = pts[j];
    if (n) last = sum / n;
    out.push([x / 1000, last, p.lat, p.lon]);
  }
  return out;
}

// Phone GPS altitude is noisy (unlike Strava's smoothed stream), so climb
// is counted on the smoothed profile and only once a rise/fall passes 3 m.
function climbing(profile) {
  let gain = 0, loss = 0, ref = profile[0]?.[1] ?? 0;
  for (const [, e] of profile) {
    if (e - ref > 3) { gain += e - ref; ref = e; }
    else if (ref - e > 3) { loss += ref - e; ref = e; }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

// Recorded stretches: count time actually moving. Estimated stretches
// have interpolated timestamps, so count them at face value when the
// implied speed is a plausible riding speed.
function movingSeconds(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    const dd = pts[i].d - pts[i - 1].d;
    if (dt <= 0) continue;
    if (pts[i].est) { if (dd / dt > 1.0 && dd / dt < 10) s += dt; }
    else if (dt < 60 && dd / dt > 1.0) s += dt;
  }
  return Math.round(s);
}

// ---------- rides ----------
// Recorded stretches and the routed fill-ins between them are joined into
// one continuous ride for each run of riding between trains and ferries.
const transferWindows = transfers.map((t) => [Date.parse(atLocal(t.date, t.depart)), Date.parse(atLocal(t.date, t.arrive))]);
const tracks = buildTracks();
const merged = [];
for (const track of tracks) {
  const last = merged.at(-1);
  const prevEnd = last?.pts.at(-1).t;
  const nextStart = track.pts[0].t;
  const transferBetween = transferWindows.some(([t0]) => t0 >= prevEnd && t0 <= nextStart);
  if (last && last.date === track.date && !transferBetween) last.pts.push(...track.pts);
  else merged.push({ date: track.date, pts: [...track.pts] });
}

// Riding entirely in the UK (Bristol, across London, the Dover hops) is
// getting to and from the tour: drawn, but not counted, like the UK trains.
const inUK = (pts) => pts.every((p) => p.lon < 1.6);

const rides = merged.map((track, n) => {
  const pts = track.pts;
  let d = 0;
  pts.forEach((p, i) => {
    if (i) d += haversine([pts[i - 1].lat, pts[i - 1].lon], [p.lat, p.lon]);
    p.d = d;
  });
  const profile = profileFor(pts);
  return {
    kind: "ride",
    ...(inUK(pts) ? { offTour: true } : {}),
    id: `ride-${track.date}-${merged.filter((m, i) => m.date === track.date && i < n).length + 1}`,
    date: track.date,
    start: new Date(pts[0].t).toISOString(),
    end: new Date(pts[pts.length - 1].t).toISOString(),
    km: round(d / 1000, 1),
    movingSeconds: movingSeconds(pts),
    elapsedSeconds: Math.round((pts[pts.length - 1].t - pts[0].t) / 1000),
    ...climbing(profile),
    coords: simplify(pts.map((p) => [p.lat, p.lon]), 6).map(([a, b]) => [round(a, 5), round(b, 5)]),
    profile: profile.map(([k, e, la, lo]) => [round(k, 2), round(e, 1), round(la, 5), round(lo, 5)]),
  };
});

// ---------- transfers ----------
// A flight is drawn as a gentle arc (quadratic Bézier bulging to the
// left of the direction of travel) so it reads as "in the air".
function flightArc(from, to, bulge = 0.3, steps = 64) {
  const k = Math.cos(rad((from[0] + to[0]) / 2));
  const [ax, ay] = [from[1] * k, from[0]];
  const [bx, by] = [to[1] * k, to[0]];
  const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
  const [dx, dy] = [bx - ax, by - ay];
  const [cx, cy] = [mx - dy * bulge, my + dx * bulge];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y = u * u * ay + 2 * u * t * cy + t * t * by;
    out.push([round(y, 5), round(x / k, 5)]);
  }
  return out;
}

const transferSegs = transfers.map((t) => {
  let coords, km;
  if (t.mode === "train") {
    const cache = path.resolve(`data/rail/${t.id}.json`);
    if (!fs.existsSync(cache)) throw new Error(`Missing ${cache} — run npm run data:rail`);
    const rail = JSON.parse(fs.readFileSync(cache, "utf8"));
    coords = simplify(rail.coords, 6);
    km = rail.km;
  } else if (t.mode === "flight") {
    coords = flightArc(t.from, t.to);
    km = round(haversine(t.from, t.to) / 1000, 1);
  } else {
    coords = t.path;
    km = round(pathLength(coords) / 1000, 1);
  }
  return { kind: t.mode, id: t.id, ...(t.offTour ? { offTour: true } : {}), date: t.date, start: atLocal(t.date, t.depart), end: atLocal(t.date, t.arrive), name: t.name, note: t.note, km, coords };
});

// ---------- photos ----------
const localDate = (iso) => new Date(new Date(iso).getTime() + TIMEZONE_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);
const captions = JSON.parse(fs.readFileSync("content/captions.json", "utf8"));
const photos = JSON.parse(fs.readFileSync("data/photos.json", "utf8"))
  .filter((p) => !captions[p.id]?.hidden)
  .map((p) => ({
  id: p.id,
  kind: p.kind,
  takenAt: p.takenAt,
  date: localDate(p.takenAt),
  lat: p.lat,
  lon: p.lon,
  width: p.width,
  height: p.height,
  src: `/photos/full/${p.id}.webp`,
  thumb: `/photos/thumb/${p.id}.webp`,
  blur: p.blur,
  caption: captions[p.id]?.caption ?? "",
  ...(p.credit ? { credit: p.credit } : {}),
}));

// ---------- raw recordings ----------
// What the phone actually logged, for the "Raw GPS" overlay: a light
// line through every fix, plus the fixes either side of each jump
// (where the line is a guess) with their times.
const raw = rawRecordings().map((r) => {
  const pts = r.pts;
  const anchors = pts.filter((p, i) =>
    (i > 0 && haversine([pts[i - 1].lat, pts[i - 1].lon], [p.lat, p.lon]) > 250) ||
    (i < pts.length - 1 && haversine([p.lat, p.lon], [pts[i + 1].lat, pts[i + 1].lon]) > 250) ||
    i === 0 || i === pts.length - 1);
  return {
    date: localDay(pts[0].t),
    sport: r.sport === "Biking" ? "ride" : "walk",
    coords: simplify(pts.map((p) => [p.lat, p.lon]), 3).map(([a, b]) => [round(a, 5), round(b, 5)]),
    fixes: anchors.map((p) => [round(p.lat, 5), round(p.lon, 5), new Date(p.t).toISOString().slice(0, 19) + "Z"]),
  };
});

const W = loadWeather();

// ---------- assemble days ----------
const allDates = Object.keys(dayTitles).sort();
const days = allDates.map((date, i) => {
  const allRides = rides.filter((r) => r.date === date);
  const allTransfers = transferSegs.filter((t) => t.date === date);
  // Stats count only the tour itself, not getting to and from it.
  const dayRides = allRides.filter((r) => !r.offTour);
  const dayTransfers = allTransfers.filter((t) => !t.offTour);
  // Every leg is timestamped (transfers approximately), so just sort.
  const segments = [...allRides, ...allTransfers].sort((a, b) => a.start.localeCompare(b.start));

  // Day elevation profile: rides end-to-end; transfers occupy their
  // distance on the x-axis but carry no elevation.
  let offset = 0;
  const profile = [];
  const bands = [];
  for (const s of segments) {
    // Flights, ferries and the UK legs aren't part of the riding profile.
    if (s.kind === "flight" || s.kind === "ferry" || s.offTour) continue;
    if (s.kind === "ride") {
      for (const [k, e, la, lo] of s.profile) profile.push([round(k + offset, 2), e, la, lo]);
    } else {
      bands.push({ kind: s.kind, name: s.name, from: round(offset, 2), to: round(offset + s.km, 2) });
      profile.push(null); // break in the line
    }
    offset += s.km;
  }

  const ridesKm = round(dayRides.reduce((a, r) => a + r.km, 0), 1);
  const trainKm = round(dayTransfers.filter((t) => t.kind === "train").reduce((a, t) => a + t.km, 0), 1);
  const stay = stays.find((s) => s.night === date || (s.nights && localDiff(s.night, date) < s.nights && localDiff(s.night, date) >= 0));

  // Place each photo on the day profile (nearest point within 400 m).
  const dayPhotos = photos
    .filter((p) => p.date === date)
    .map((p) => {
      let km = null;
      if (p.lat != null) {
        let best = 400;
        for (const pt of profile) {
          if (!pt) continue;
          const d = haversine([p.lat, p.lon], [pt[2], pt[3]]);
          if (d < best) { best = d; km = pt[0]; }
        }
      }
      return { ...p, km };
    });

  return {
    id: date,
    index: i + 1,
    date,
    ...dayTitles[date],
    stats: {
      rideKm: ridesKm,
      trainKm,
      gain: dayRides.reduce((a, r) => a + r.gain, 0),
      loss: dayRides.reduce((a, r) => a + r.loss, 0),
      movingSeconds: dayRides.reduce((a, r) => a + r.movingSeconds, 0),
      maxEle: profile.length ? Math.round(Math.max(...profile.filter(Boolean).map((p) => p[1]))) : null,
      minEle: profile.length ? Math.round(Math.min(...profile.filter(Boolean).map((p) => p[1]))) : null,
    },
    stayId: stay?.id ?? null,
    segments: segments.map(({ profile: _p, ...s }) => s),
    profile,
    bands,
    photos: dayPhotos,
    raw: raw.filter((r) => r.date === date).map(({ date: _d, ...r }) => r),
    weather: dayWeather(W, date, merged.filter((m) => m.date === date).map((m) => m.pts), stays.find((s) => s.night === date) ?? null).summary,
  };
});

function localDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400e3);
}

const totals = {
  rideKm: round(rides.filter((r) => !r.offTour).reduce((a, r) => a + r.km, 0), 1),
  trainKm: round(transferSegs.filter((t) => t.kind === "train" && !t.offTour).reduce((a, t) => a + t.km, 0), 1),
  ferryKm: round(transferSegs.filter((t) => t.kind === "ferry").reduce((a, t) => a + t.km, 0), 1),
  flightKm: round(transferSegs.filter((t) => t.kind === "flight").reduce((a, t) => a + t.km, 0), 1),
  gain: rides.filter((r) => !r.offTour).reduce((a, r) => a + r.gain, 0),
  loss: rides.filter((r) => !r.offTour).reduce((a, r) => a + r.loss, 0),
  maxEle: Math.max(...days.map((d) => d.stats.maxEle ?? 0)),
  movingSeconds: rides.filter((r) => !r.offTour).reduce((a, r) => a + r.movingSeconds, 0),
  ridingDays: new Set(rides.filter((r) => !r.offTour).map((r) => r.date)).size,
  nights: stays.reduce((a, s) => a + (s.nights ?? 1), 0),
  photos: photos.length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ totals, stays, days }));
console.log(`✓ ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(totals);
for (const d of days) console.log(d.date, d.stats.rideKm, "km ride", d.stats.trainKm, "km train", d.stats.gain, "m gain", d.segments.map((s) => s.kind).join(">"), d.stayId, d.photos.length, "photos");
