import type { Tour } from "./types";
import { fmtDuration, fmtInt } from "./format";

/** The headline numbers under the masthead (and on the link preview image). */
export const headlineStats = (t: Tour["totals"]) => [
  { label: "Ridden", value: fmtInt(Math.round(t.rideKm)), unit: "km" },
  { label: "By train", value: fmtInt(Math.round(t.trainKm)), unit: "km" },
  { label: "Moving", value: fmtDuration(t.movingSeconds).replace(/ \d+m$/, ""), unit: "" },
  { label: "Climbed", value: fmtInt(t.gain), unit: "m" },
  { label: "Descended", value: fmtInt(t.loss), unit: "m" },
  { label: "Highest", value: fmtInt(t.maxEle), unit: "m" },
  { label: "Riding days", value: String(t.ridingDays), unit: "" },
  { label: "Nights out", value: String(t.nights), unit: "" },
  { label: "Photos", value: String(t.photos), unit: "" },
];
