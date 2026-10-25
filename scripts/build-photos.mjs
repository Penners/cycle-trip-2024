// Turns the raw phone photos in photos/ into web-sized WebP files in
// public/photos/ and writes their metadata (time, position) to
// data/photos.json for build-data.mjs. Skips files already converted.
//
// A photo with no GPS (location off in the camera app) is placed where
// the track was when it was taken: recorded
// rides and walks, or the estimated route between them.
//
// Photos from anywhere else (say a friend's Instagram stories) can be
// added by an optional per-tour scripts/extra-photos.mjs: see 2024's.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import exifr from "exifr";
import sharp from "sharp";
import { CAMERA_CLOCK, TIMEZONE_OFFSET_HOURS, transfers } from "./tour.config.mjs";
import { photoFixes, haversine, atLocal, isTimed } from "./tracks.mjs";

const SRC = path.resolve("photos");
const OUT = path.resolve("public/photos");
fs.mkdirSync(path.join(OUT, "full"), { recursive: true });
fs.mkdirSync(path.join(OUT, "thumb"), { recursive: true });

// Photos marked hidden in content/captions.json never reach public/.
const captions = JSON.parse(fs.readFileSync("content/captions.json", "utf8"));

/** Camera-local wall time → UTC, using whichever clock setting was in force. */
function cameraToUtc(y, mo, d, h, mi, s) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - (CAMERA_CLOCK[0]?.offsetHours ?? TIMEZONE_OFFSET_HOURS) * 3600e3;
  for (const c of CAMERA_CLOCK) {
    const candidate = wall - c.offsetHours * 3600e3;
    if (candidate >= new Date(c.from).getTime()) utc = candidate;
  }
  return utc;
}

// Where were we at time t? Interpolate between the fixes either side,
// as long as they're close in time, or close in space (stopped somewhere,
// e.g. dinner between two walks). Otherwise we don't know.
const fixes = photoFixes();

// Taken on a train or ferry (out of signal at sea, say)? Place it along
// that leg's line, assuming steady progress from departure to arrival.
const legs = transfers.filter(isTimed).map((t) => {
  const rail = path.resolve(`data/rail/${t.id}.json`);
  const coords = t.path ?? (fs.existsSync(rail) ? JSON.parse(fs.readFileSync(rail, "utf8")).coords : [t.from, t.to]);
  return { t0: atLocal(t.date, t.depart), t1: atLocal(t.date, t.arrive), coords };
});
function onTransfer(t) {
  const leg = legs.find((l) => t >= l.t0 && t <= l.t1);
  if (!leg) return null;
  const cum = [0];
  for (let i = 1; i < leg.coords.length; i++) cum.push(cum[i - 1] + haversine(leg.coords[i - 1], leg.coords[i]));
  const target = (cum.at(-1) * (t - leg.t0)) / (leg.t1 - leg.t0);
  const i = Math.max(1, cum.findIndex((c) => c >= target));
  const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const [a, b] = [leg.coords[i - 1], leg.coords[i]];
  return { lat: a[0] + (b[0] - a[0]) * f, lon: a[1] + (b[1] - a[1]) * f, transfer: true };
}
function locate(t) {
  let i = fixes.findIndex((f) => f.t > t);
  if (i === -1) i = fixes.length;
  const [a, b] = [fixes[i - 1], fixes[i]];
  if (a && b) {
    const gapMin = (b.t - a.t) / 60e3;
    const apart = haversine([a.lat, a.lon], [b.lat, b.lon]);
    if (gapMin <= 20 || apart <= 500) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, est: a.est || b.est };
    }
  }
  const near = [a, b].filter((p) => p && Math.abs(p.t - t) <= 15 * 60e3).sort((p, q) => Math.abs(p.t - t) - Math.abs(q.t - t))[0];
  return near ? { lat: near.lat, lon: near.lon, est: near.est } : null;
}

const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
const photos = [];

for (const file of files) {
  // PXL_20260918_111024607.MP.jpg: filename time is UTC.
  // IMG_20250902_125529175_HDR.jpg: filename time is the camera's clock.
  const m = file.match(/(PXL|IMG)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(\d{3})/);
  if (!m) continue;
  const [, prefix, y, mo, d, h, mi, s, ms] = m;
  const id = `${y}${mo}${d}-${h}${mi}${s}${ms}`;
  const utc = prefix === "PXL" ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) : cameraToUtc(+y, +mo, +d, +h, +mi, +s);
  const takenAt = new Date(utc).toISOString().replace(".000", "");
  const kind = /PANO/.test(file) ? "pano" : "photo";
  if (captions[id]?.hidden) {
    for (const size of ["full", "thumb"]) fs.rmSync(path.join(OUT, size, `${id}.webp`), { force: true });
    continue;
  }

  const src = path.join(SRC, file);
  const gps = await exifr.gps(src).catch(() => null);
  // A position set by hand in captions.json wins: phone GPS is sometimes
  // a couple of kilometres out (a Wi-Fi or cell-mast fix).
  const pinned = captions[id]?.lat != null ? { lat: captions[id].lat, lon: captions[id].lon, est: false } : null;
  const where = pinned ?? (gps?.latitude ? { lat: gps.latitude, lon: gps.longitude, est: false } : locate(utc) ?? onTransfer(utc));
  const full = path.join(OUT, "full", `${id}.webp`);
  const thumb = path.join(OUT, "thumb", `${id}.webp`);

  if (!fs.existsSync(full)) {
    const longEdge = kind === "pano" ? 3200 : 1800;
    await sharp(src).rotate().resize(longEdge, longEdge, { fit: "inside" }).webp({ quality: 78 }).toFile(full);
  }
  if (!fs.existsSync(thumb)) {
    await sharp(src).rotate().resize(360, 360, { fit: "cover" }).webp({ quality: 70 }).toFile(thumb);
  }
  const { width, height } = await sharp(full).metadata();
  // A ~40px version inlined as a data URI: shown blurred, with no extra
  // request, while the full photo loads in the lightbox.
  const tiny = await sharp(full).resize(40, 40, { fit: "inside" }).webp({ quality: 50 }).toBuffer();
  const blur = `data:image/webp;base64,${tiny.toString("base64")}`;

  photos.push({
    id,
    file,
    kind,
    takenAt,
    lat: where ? +where.lat.toFixed(6) : null,
    lon: where ? +where.lon.toFixed(6) : null,
    // "gps" from the photo itself, "track" from a recorded fix, "estimate"
    // from a best-guess route.
    located: pinned ? "pinned" : gps?.latitude ? "gps" : where ? (where.transfer ? "transfer" : where.est ? "estimate" : "track") : null,
    width,
    height,
    blur,
  });
  process.stdout.write(".");
}

// Its default export gets { captions, OUT } and returns more entries
// for data/photos.json, having written their WebPs to OUT itself.
const EXTRA = path.resolve("scripts/extra-photos.mjs");
if (fs.existsSync(EXTRA)) photos.push(...(await (await import(pathToFileURL(EXTRA).href)).default({ captions, OUT })));

photos.sort((a, b) => a.takenAt.localeCompare(b.takenAt));

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/photos.json", JSON.stringify(photos, null, 1));
const count = (k) => photos.filter((p) => p.located === k).length;
console.log(`\n✓ ${photos.length} photos: ${count("gps")} GPS, ${count("pinned")} pinned by hand, ${count("track")} placed on recorded track, ${count("estimate")} on estimated route, ${count("transfer")} along a train/ferry by time, ${photos.filter((p) => !p.located).length} unplaced`);
