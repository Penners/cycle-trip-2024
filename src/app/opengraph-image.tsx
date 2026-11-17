// The link preview image (og:image, and X/Slack/WhatsApp cards): the
// masthead and headline stats from the top of the page, drawn at build
// time from src/data/tour.json.
import { ImageResponse } from "next/og";
import tourData from "@/data/tour.json";
import type { Tour } from "@/lib/types";
import { headlineStats } from "@/lib/stats";

const tour = tourData as unknown as Tour;
const { meta } = tour;
const stats = headlineStats(tour.totals);

export const alt = meta.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The page's colours (light theme, src/app/globals.css).
const C = { bg: "#f6f2ea", surface: "#fffdf8", line: "#e2dacb", ink: "#1f1b17", ink2: "#5b534a", ink3: "#8a8177", accent: "#e8590c" };

const eyebrow = [meta.dates, meta.riders].filter(Boolean).join(" · ");
const heading = `${meta.from} → ${meta.to}`;

/**
 * A static TTF of a Google font, cut down to the characters drawn (the
 * image renderer can't read the WOFF2 that next/font serves). Fetched at
 * build time, like next/font itself.
 */
async function googleFont(family: string, text: string) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)).text();
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} from Google Fonts`);
  return (await fetch(url)).arrayBuffer();
}

const sansText = eyebrow.toUpperCase() + meta.lede + stats.map((s) => s.label.toUpperCase() + s.value + s.unit).join("");
const fonts = [
  // The masthead's Fraunces cut: semibold, optical size 96, half soft.
  { name: "Fraunces", data: await googleFont("Fraunces:opsz,wght,SOFT@96,600,50", heading), weight: 600 as const },
  { name: "Inter", data: await googleFont("Inter:wght@400", sansText), weight: 400 as const },
  { name: "Inter", data: await googleFont("Inter:wght@600", sansText), weight: 600 as const },
];

// Long "From → To" headings step down so they still fit in two lines, and
// a long date line so it stays on one.
const headingSize = heading.length > 24 ? 72 : heading.length > 18 ? 84 : 96;
const eyebrowSize = eyebrow.length > 36 ? 17 : 20;

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, color: C.ink, fontFamily: "Inter", padding: "64px 64px 64px 72px", gap: 56 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: eyebrowSize, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink3, fontWeight: 600 }}>{eyebrow}</div>
          <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Fraunces", fontWeight: 600, fontSize: headingSize, lineHeight: 1.02, letterSpacing: "-0.02em", margin: "18px 0 24px" }}>
            <span>{meta.from}</span>
            <span style={{ color: C.accent, margin: "0 0.25em" }}>→</span>
            <span>{meta.to}</span>
          </div>
          {meta.lede && <div style={{ fontSize: 26, lineHeight: 1.35, color: C.ink2 }}>{meta.lede}</div>}
        </div>
        <div style={{ width: 500, display: "flex", flexWrap: "wrap", alignSelf: "center", background: C.line, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", gap: 1 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ width: 165.33, height: 150, display: "flex", flexDirection: "column", justifyContent: "center", background: C.surface, padding: "0 20px" }}>
              <div style={{ fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink3, fontWeight: 600 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 6, fontSize: 38, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {s.value}
                {s.unit && <span style={{ fontSize: 20, color: C.ink2, fontWeight: 400, marginLeft: 6 }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
