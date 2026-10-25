// The tour sites share one framework: every file listed here is meant to
// be byte-identical in each sibling repo (../cycle-*), and everything
// about a particular tour lives in scripts/tour.config.mjs (plus the
// optional scripts/extra-photos.mjs), content/, data/, gpxdata/ and
// photos/. `npm run framework:check` lists any framework file that has
// drifted; copy the improved version across rather than editing in place.
import fs from "node:fs";
import path from "node:path";

const SCRIPTS = ["build-data", "build-photos", "check-framework", "copy-maplibre-worker", "fetch-rail", "fetch-routes", "fetch-weather", "tracks", "weather"].map((s) => `scripts/${s}.mjs`);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const FILES = [...SCRIPTS, "next.config.ts", ...walk("src").map((f) => f.split(path.sep).join("/")).filter((f) => f !== "src/data/tour.json")].sort();

const here = path.basename(process.cwd());
const siblings = fs.readdirSync("..").filter((d) => d !== here && d.startsWith("cycle-") && fs.existsSync(path.join("..", d, "scripts/tour.config.mjs")));
let drift = 0;
for (const sib of siblings) {
  const differ = FILES.filter((f) => {
    const other = path.join("..", sib, f);
    return !fs.existsSync(other) || !fs.readFileSync(other).equals(fs.readFileSync(f));
  });
  drift += differ.length;
  console.log(differ.length ? `✗ ${sib}: ${differ.length} differ\n  ${differ.join("\n  ")}` : `✓ ${sib}: same framework`);
}
process.exitCode = drift ? 1 : 0;
