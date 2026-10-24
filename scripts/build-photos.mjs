// Turns the raw phone photos in photos/ into web-sized WebP files in
// public/photos/ and writes their metadata (time, position) to
// data/photos.json for build-data.mjs. Skips files already converted.
//
// The 2024 photos have no GPS (location was off in the camera app), so
// each one is placed where the track was when it was taken: recorded
// rides and walks, or the estimated route between them.
import fs from "node:fs";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import { CAMERA_CLOCK } from "./tour.config.mjs";
import { photoFixes, haversine } from "./tracks.mjs";

const SRC = path.resolve("photos");
const OUT = path.resolve("public/photos");
fs.mkdirSync(path.join(OUT, "full"), { recursive: true });
fs.mkdirSync(path.join(OUT, "thumb"), { recursive: true });

// Photos marked hidden in content/captions.json never reach public/.
const captions = JSON.parse(fs.readFileSync("content/captions.json", "utf8"));

/** Camera-local wall time → UTC, using whichever clock setting was in force. */
function cameraToUtc(y, mo, d, h, mi, s) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - CAMERA_CLOCK[0].offsetHours * 3600e3;
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
  // IMG_20240405_125529175_HDR.jpg: filename time is the camera's clock.
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
  const where = gps?.latitude ? { lat: gps.latitude, lon: gps.longitude, est: false } : locate(utc);
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
    located: gps?.latitude ? "gps" : where ? (where.est ? "estimate" : "track") : null,
    width,
    height,
    blur,
  });
  process.stdout.write(".");
}

// ---------- Mike's Instagram stories ----------
// insta/ is git-ignored (it's Mike's data). Positions come from
// insta/netherlands/placements.json: his location stickers checked against
// the timestamp on our track, with a few pinned by hand. Ids start "ig-".
const IG = path.resolve("insta/netherlands");
if (fs.existsSync(path.join(IG, "placements.json"))) {
  for (const p of JSON.parse(fs.readFileSync(path.join(IG, "placements.json"), "utf8"))) {
    const id = "ig-" + p.takenAt.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    if (captions[id]?.hidden) {
      for (const size of ["full", "thumb"]) fs.rmSync(path.join(OUT, size, `${id}.webp`), { force: true });
      continue;
    }
    const src = path.join(IG, p.file);
    const full = path.join(OUT, "full", `${id}.webp`);
    const thumb = path.join(OUT, "thumb", `${id}.webp`);
    if (!fs.existsSync(full)) await sharp(src).webp({ quality: 78 }).toFile(full); // stories are already 720×1280
    if (!fs.existsSync(thumb)) await sharp(src).resize(360, 360, { fit: "cover" }).webp({ quality: 70 }).toFile(thumb);
    const { width, height } = await sharp(full).metadata();
    const tiny = await sharp(full).resize(40, 40, { fit: "inside" }).webp({ quality: 50 }).toBuffer();
    photos.push({
      id, file: p.file, kind: "photo", takenAt: p.takenAt.replace(".000", ""),
      lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), located: p.how, credit: "Mike",
      width, height, blur: `data:image/webp;base64,${tiny.toString("base64")}`,
    });
    process.stdout.write(".");
  }
}
photos.sort((a, b) => a.takenAt.localeCompare(b.takenAt));

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/photos.json", JSON.stringify(photos, null, 1));
const count = (k) => photos.filter((p) => p.located === k).length;
console.log(`\n✓ ${photos.length} photos: ${count("gps")} GPS, ${count("track")} placed on recorded track, ${count("estimate")} on estimated route, ${photos.filter((p) => !p.located).length} unplaced`);
