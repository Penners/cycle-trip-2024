// Turns the patchy Google Health/Fit TCX exports into continuous rides.
//
// The phone often logged a fix only every few minutes, so a ride is a
// mix of dense stretches and long straight "jumps" across fields, and
// whole legs between recordings are missing. This module:
//   1. parses every Biking activity and drops GPS spikes;
//   2. finds runs of sparse fixes inside each ride ("jumps");
//   3. finds the gaps *between* rides, stays and transfers on each day
//      that must have been cycled ("bridges");
//   4. routes both along real cycle paths with BRouter (cached in
//      data/routes/ by fetch-routes.mjs) and marks those points `est`.
// Shared by fetch-routes.mjs (which fills the cache) and build-data.mjs
// (which reads it and never touches the network).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { stays, transfers, TIMEZONE_OFFSET_HOURS } from "./tour.config.mjs";

const GPX_DIR = path.resolve("gpxdata");
export const ROUTE_DIR = path.resolve("data/routes");

/** Consecutive fixes further apart than this are routed, not joined straight. */
const JUMP_M = 250;
/** Gaps between anchors shorter than this are just joined. */
const BRIDGE_MIN_M = 150;
/** A bridge longer than this is probably a missing transfer: warn, don't guess. */
const BRIDGE_MAX_M = 20000;
/** Speed used to estimate moving time on unrecorded bridges. */
const EST_KMH = 16;

// ---------- geometry ----------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export function haversine(a, b) {
  const x = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const ll = (p) => [p.lat, p.lon];
export const localDate = (ms) => new Date(ms + TIMEZONE_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);
const atLocal = (date, hhmm) => new Date(`${date}T${hhmm}:00Z`).getTime() - TIMEZONE_OFFSET_HOURS * 3600e3;

// ---------- parse ----------
const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => ["Activity", "Lap", "Trackpoint"].includes(name) });

function parseRecordings({ sports = ["Biking"] } = {}) {
  const out = [];
  for (const file of fs.readdirSync(GPX_DIR).filter((f) => f.endsWith(".tcx")).sort()) {
    const xml = parser.parse(fs.readFileSync(path.join(GPX_DIR, file), "utf8"));
    // Google exports split one recording into several activities when
    // it thinks you switched between cycling and walking.
    for (const act of xml.TrainingCenterDatabase.Activities.Activity) {
      if (!sports.includes(act["@_Sport"])) continue;
      const pts = [];
      for (const lap of act.Lap) {
        for (const tp of lap.Track?.Trackpoint ?? []) {
          if (tp.Position?.LatitudeDegrees == null) continue;
          pts.push({
            t: new Date(tp.Time).getTime(),
            lat: +tp.Position.LatitudeDegrees,
            lon: +tp.Position.LongitudeDegrees,
            alt: tp.AltitudeMeters != null ? +tp.AltitudeMeters : null,
            est: false,
          });
        }
      }
      if (pts.length) out.push({ sport: act["@_Sport"], id: `ride-${new Date(pts[0].t).toISOString().slice(0, 16).replace(/[-:]/g, "")}`, pts: altDespike(despike(pts)) });
    }
  }
  return out.sort((a, b) => a.pts[0].t - b.pts[0].t);
}

// Drop single fixes that leap away and straight back (> 60 km/h out and in).
function despike(pts) {
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const kmh = (a, b) => haversine(ll(a), ll(b)) / 1000 / Math.max((b.t - a.t) / 3600e3, 1 / 3600);
    return !(kmh(pts[i - 1], p) > 60 && kmh(p, pts[i + 1]) > 60);
  });
}

// GPS altitude is sometimes tens of metres off: a few stray fixes, or a
// long run stuck at one value while the phone gets a lock (an 80 m hill
// in a polder). Blank readings more than 15 m from the median of their
// ±10 neighbours, or 30 m from the ride's median; the profile bridges
// the hole.
function altDespike(pts) {
  const alts = pts.map((p) => p.alt);
  const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const rideMedian = median(alts.filter((a) => a != null));
  return pts.map((p, i) => {
    if (p.alt == null) return p;
    const local = median(alts.slice(Math.max(0, i - 10), i + 11).filter((a) => a != null));
    return Math.abs(p.alt - local) > 15 || Math.abs(p.alt - rideMedian) > 30 ? { ...p, alt: null } : p;
  });
}

// ---------- planning ----------
const waypointKey = (wps) => wps.map(([la, lo]) => `${lo.toFixed(5)},${la.toFixed(5)}`).join("|");
export const cacheFile = (lonlats) => path.join(ROUTE_DIR, `${crypto.createHash("sha1").update(lonlats).digest("hex").slice(0, 12)}.json`);

/** Index runs [i, j] inside a ride where every step is a jump. */
function jumpRuns(pts) {
  const runs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (haversine(ll(pts[i]), ll(pts[i + 1])) <= JUMP_M) continue;
    let j = i + 1;
    while (j < pts.length - 1 && haversine(ll(pts[j]), ll(pts[j + 1])) > JUMP_M) j++;
    runs.push([i, j]);
    i = j - 1;
  }
  return runs;
}

/**
 * Each day as a time-ordered chain of anchors: last night's stay, the
 * recorded rides, the transfers, tonight's stay. Any gap between one
 * anchor's end and the next one's start was cycled but not recorded.
 */
/**
 * Some ferries were taken mid-recording. Cut any ride that overlaps a
 * transfer's time window into the part before departure and the part
 * after arrival, so the crossing isn't routed as riding.
 */
function splitAtTransfers(rides) {
  for (const t of transfers) {
    const [t0, t1] = [atLocal(t.date, t.depart), atLocal(t.date, t.arrive)];
    rides = rides.flatMap((r) => {
      if (r.pts[0].t >= t1 || r.pts.at(-1).t <= t0) return [r];
      const before = r.pts.filter((p) => p.t <= t0);
      const after = r.pts.filter((p) => p.t >= t1);
      return [
        ...(before.length ? [{ id: r.id, pts: before }] : []),
        ...(after.length ? [{ id: `${r.id}b`, pts: after }] : []),
      ];
    });
  }
  return rides;
}

function plan() {
  const rides = splitAtTransfers(parseRecordings());
  const dates = [...new Set([...rides.map((r) => localDate(r.pts[0].t)), ...transfers.map((t) => t.date)])].sort();
  const bridges = [];
  const warnings = [];
  for (const date of dates) {
    const prevNight = new Date(new Date(date).getTime() - 86400e3).toISOString().slice(0, 10);
    const anchors = [];
    const lastStay = stays.find((s) => s.night === prevNight);
    if (lastStay) anchors.push({ label: lastStay.name, t0: -Infinity, t1: -Infinity, start: [lastStay.lat, lastStay.lon], end: [lastStay.lat, lastStay.lon] });
    for (const r of rides.filter((r) => localDate(r.pts[0].t) === date)) {
      anchors.push({ label: r.id, t0: r.pts[0].t, t1: r.pts.at(-1).t, start: ll(r.pts[0]), end: ll(r.pts.at(-1)) });
    }
    for (const t of transfers.filter((t) => t.date === date)) {
      const coords = t.path ?? [t.from, t.to];
      anchors.push({ label: t.id, t0: atLocal(date, t.depart), t1: atLocal(date, t.arrive), start: coords[0], end: coords.at(-1) });
    }
    const stay = stays.find((s) => s.night === date);
    if (stay) anchors.push({ label: stay.name, t0: Infinity, t1: Infinity, start: [stay.lat, stay.lon], end: [stay.lat, stay.lon] });
    anchors.sort((a, b) => a.t0 - b.t0);

    for (let k = 1; k < anchors.length; k++) {
      const [a, b] = [anchors[k - 1], anchors[k]];
      const d = haversine(a.end, b.start);
      if (d < BRIDGE_MIN_M) continue;
      if (d > BRIDGE_MAX_M) {
        warnings.push(`${date}: ${(d / 1000).toFixed(1)} km unexplained gap ${a.label} → ${b.label} (add a transfer?)`);
        continue;
      }
      const t0 = Number.isFinite(a.t1) ? a.t1 : b.t0 - (d / 1000 / EST_KMH) * 3600e3;
      const t1 = Number.isFinite(b.t0) ? b.t0 : a.t1 + (d / 1000 / EST_KMH) * 3600e3;
      bridges.push({ id: `est-${date.replace(/-/g, "")}-${bridges.filter((x) => x.date === date).length + 1}`, date, from: a.end, to: b.start, t0, t1, between: [a.label, b.label] });
    }
  }

  // Every BRouter request the build needs, keyed by its waypoint string.
  const requests = new Map();
  for (const r of rides) {
    r.runs = jumpRuns(r.pts);
    for (const [i, j] of r.runs) requests.set(waypointKey(r.pts.slice(i, j + 1).map(ll)), null);
  }
  for (const b of bridges) requests.set(waypointKey([b.from, b.to]), null);
  return { rides, bridges, warnings, requests: [...requests.keys()] };
}

export const planTracks = plan;

// ---------- assemble ----------
function readRoute(lonlats) {
  const file = cacheFile(lonlats);
  if (!fs.existsSync(file)) throw new Error(`Missing route cache for ${lonlats.slice(0, 60)}… — run npm run data:routes`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Routed points between two fixes, timestamps spread evenly along the
 * routed distance. Falls back to the straight line if the router took a
 * silly detour (it doesn't know about every ferry or closed path).
 */
function routedPoints(wps, t0, t1) {
  const lonlats = waypointKey(wps);
  const route = readRoute(lonlats);
  let straight = 0;
  for (let i = 1; i < wps.length; i++) straight += haversine(wps[i - 1], wps[i]);
  const coords = route.coords && route.km * 1000 < straight * 3 + 2000 ? route.coords : wps.map(([la, lo]) => [la, lo, null]);
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum.at(-1) || 1;
  return coords.map(([lat, lon, ele], i) => ({ t: t0 + ((t1 - t0) * cum[i]) / total, lat, lon, alt: ele ?? null, est: true }));
}

export function buildTracks() {
  const { rides, bridges, warnings } = plan();
  for (const w of warnings) console.warn(`⚠ ${w}`);

  const out = rides.map((r) => {
    const pts = [];
    let from = 0;
    for (const [i, j] of r.runs) {
      pts.push(...r.pts.slice(from, i + 1));
      const filled = routedPoints(r.pts.slice(i, j + 1).map(ll), r.pts[i].t, r.pts[j].t);
      pts.push(...filled.slice(1, -1));
      from = j;
    }
    pts.push(...r.pts.slice(from));
    // The sparse fixes themselves are real, but the line into and out of
    // them is a guess, so they belong to the estimated stretch.
    for (const [i, j] of r.runs) for (let k = i + 1; k < j; k++) r.pts[k].est = true;
    return { id: r.id, date: localDate(r.pts[0].t), bridge: false, pts };
  });

  for (const b of bridges) {
    out.push({ id: b.id, date: b.date, bridge: true, between: b.between, pts: routedPoints([b.from, b.to], b.t0, b.t1) });
  }

  // The phone's GPS altitude is height above the ellipsoid, ~45 m higher
  // than BRouter's sea-level elevation around here. Left alone, every
  // switch between recorded and estimated points is a fake 45 m climb.
  // Measure the offset where the two meet and shift the GPS heights.
  const diffs = [];
  for (const { pts } of out) {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      if (a.est === b.est || a.alt == null || b.alt == null) continue;
      diffs.push(a.est ? b.alt - a.alt : a.alt - b.alt);
    }
  }
  diffs.sort((a, b) => a - b);
  const offset = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
  for (const { pts } of out) for (const p of pts) if (!p.est && p.alt != null) p.alt -= offset;
  console.log(`GPS altitude offset: ${offset.toFixed(1)} m (median of ${diffs.length} joins)`);

  return out.sort((a, b) => a.pts[0].t - b.pts[0].t);
}

/** The original recordings, untouched apart from spike removal. */
export function rawRecordings() {
  return parseRecordings({ sports: ["Biking", "Walking"] });
}

/**
 * Every timed position we have — recorded rides and walks plus the
 * estimated fill-ins — for placing photos that have no GPS of their own.
 */
export function photoFixes() {
  const walks = parseRecordings({ sports: ["Walking"] }).flatMap((r) => r.pts);
  const rides = buildTracks().flatMap((t) => t.pts);
  return [...walks, ...rides].map(({ t, lat, lon, est }) => ({ t, lat, lon, est })).sort((a, b) => a.t - b.t);
}
