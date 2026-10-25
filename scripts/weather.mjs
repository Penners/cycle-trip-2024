// Turns the cached hourly weather in data/weather.json into per-day
// numbers: daytime high, overnight low at the stay, wind, gusts, rain and
// — the one that matters on a bike — the average headwind actually ridden
// into, from the wind direction against the direction of travel. Also the
// sun you rode under: thin high cloud reads as "100% cloud" yet lets most
// of the sunlight through, so the radiation dose says more about sunburn
// than the cloud figure does.
import fs from "node:fs";
import { TIMEZONE_OFFSET_HOURS } from "./tour.config.mjs";

export const GRID = 0.25;
export const cellOf = (lat, lon) => `${(Math.round(lat / GRID) * GRID).toFixed(2)},${(Math.round(lon / GRID) * GRID).toFixed(2)}`;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => ((r * 180) / Math.PI + 360) % 360;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (d) => COMPASS[Math.round(d / 45) % 8];

function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return deg(Math.atan2(y, x));
}

export function loadWeather() {
  // No weather yet (e.g. before the first rides are added): every lookup
  // comes back empty and the site just leaves the weather out.
  if (!fs.existsSync("data/weather.json")) console.warn("⚠ No data/weather.json — run npm run data:weather");
  const w = fs.existsSync("data/weather.json") ? JSON.parse(fs.readFileSync("data/weather.json", "utf8")) : { start: "1970-01-01", cells: {} };
  const t0 = new Date(`${w.start}T00:00:00Z`).getTime();
  /** Value of `v` at (lat, lon, ms), interpolated between hours. */
  const at = (v, lat, lon, ms) => {
    const series = w.cells[cellOf(lat, lon)]?.[v];
    if (!series) return null;
    const h = (ms - t0) / 3600e3;
    const i = Math.max(0, Math.min(series.length - 2, Math.floor(h)));
    const f = Math.max(0, Math.min(1, h - i));
    if (v === "wind_direction_10m") {
      // Interpolate the angle the short way round.
      const d = ((series[i + 1] - series[i] + 540) % 360) - 180;
      return (series[i] + d * f + 360) % 360;
    }
    return series[i] + (series[i + 1] - series[i]) * f;
  };
  /** Hourly values of `v` in a cell between two instants. */
  const range = (v, lat, lon, fromMs, toMs) => {
    const series = w.cells[cellOf(lat, lon)]?.[v] ?? [];
    const a = Math.max(0, Math.ceil((fromMs - t0) / 3600e3));
    const b = Math.min(series.length - 1, Math.floor((toMs - t0) / 3600e3));
    return series.slice(a, b + 1);
  };
  return { at, range };
}

const localMs = (date, hour) => new Date(`${date}T00:00:00Z`).getTime() + (hour - TIMEZONE_OFFSET_HOURS) * 3600e3;

/**
 * rides: arrays of timed points ({ t, lat, lon }) ridden that day.
 * stay: where we slept that night (for the overnight low), or null.
 */
export function dayWeather(W, date, rides, stay) {
  // Sample the riding once a minute, with the direction of travel over
  // the surrounding ~200 m so GPS wiggle doesn't flip the bearing.
  const samples = [];
  for (const pts of rides) {
    let next = pts[0]?.t ?? 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].t < next) continue;
      next = pts[i].t + 60e3;
      let j = i, k = i;
      while (j > 0 && Math.hypot(pts[i].lat - pts[j].lat, (pts[i].lon - pts[j].lon) * 0.62) < 0.0009) j--;
      while (k < pts.length - 1 && Math.hypot(pts[k].lat - pts[i].lat, (pts[k].lon - pts[i].lon) * 0.62) < 0.0009) k++;
      if (j === k) continue;
      const speed = W.at("wind_speed_10m", pts[i].lat, pts[i].lon, pts[i].t);
      const from = W.at("wind_direction_10m", pts[i].lat, pts[i].lon, pts[i].t);
      if (speed == null) continue;
      const heading = bearing(pts[j], pts[k]);
      samples.push({ ...pts[i], speed, from, heading, head: speed * Math.cos(rad(from - heading)) });
    }
  }

  // Daytime high and rain where we spent the middle of the riding day;
  // overnight low at the stay, from 8pm to 8am.
  const mid = samples[Math.floor(samples.length / 2)] ?? (stay && { lat: stay.lat, lon: stay.lon });
  const day = mid ? W.range("temperature_2m", mid.lat, mid.lon, localMs(date, 8), localMs(date, 20)) : [];
  const rain = mid ? W.range("precipitation", mid.lat, mid.lon, localMs(date, 7), localMs(date, 21)) : [];
  const night = stay ? W.range("temperature_2m", stay.lat, stay.lon, localMs(date, 20), localMs(date, 32)) : [];
  const gusts = samples.map((s) => W.at("wind_gusts_10m", s.lat, s.lon, s.t));
  // Each sample is one minute of riding.
  const sunWh = samples.reduce((a, s) => a + (W.at("shortwave_radiation", s.lat, s.lon, s.t) ?? 0) / 60, 0);
  const sunSec = samples.reduce((a, s) => a + (W.at("sunshine_duration", s.lat, s.lon, s.t) ?? 0) / 60, 0);

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // Dominant direction as a vector mean, so 350° and 10° average to 0°.
  const vx = mean(samples.map((s) => s.speed * Math.sin(rad(s.from))));
  const vy = mean(samples.map((s) => s.speed * Math.cos(rad(s.from))));
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

  return {
    samples,
    summary: {
      high: day.length ? r1(Math.max(...day)) : null,
      low: night.length ? r1(Math.min(...night)) : null,
      rainMm: rain.length ? r1(rain.reduce((a, b) => a + b, 0)) : null,
      windKmh: r1(mean(samples.map((s) => s.speed))),
      windFrom: samples.length ? compass(deg(Math.atan2(vx, vy))) : null,
      gustKmh: gusts.length ? Math.round(Math.max(...gusts)) : null,
      // Average along-track wind while riding: + into your face, − behind.
      headwindKmh: r1(mean(samples.map((s) => s.head))),
      // Share of riding time with more than 10 km/h on the nose.
      headwindShare: samples.length ? Math.round((samples.filter((s) => s.head > 10).length / samples.length) * 100) : null,
      // Mean cloud cover while riding (%), hours of sunshine while riding,
      // and total solar energy ridden under (kWh/m²).
      cloudPct: samples.length ? Math.round(mean(samples.map((s) => W.at("cloud_cover", s.lat, s.lon, s.t) ?? 0))) : null,
      sunHours: samples.length ? r1(sunSec / 3600) : null,
      sunKwh: samples.length ? r1(sunWh / 1000) : null,
    },
  };
}
