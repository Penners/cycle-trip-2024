// Mike's Instagram stories, added to data/photos.json by build-photos.mjs.
// insta/ is git-ignored (it's Mike's data). Positions come from
// insta/netherlands/placements.json: his location stickers checked against
// the timestamp on our track, with a few pinned by hand. Ids start "ig-".
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export default async function extraPhotos({ captions, OUT }) {
  const photos = [];
  const IG = path.resolve("insta/netherlands");
  if (!fs.existsSync(path.join(IG, "placements.json"))) return photos;
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
  return photos;
}
