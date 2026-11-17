import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import tourData from "@/data/tour.json";
import { fmtInt } from "@/lib/format";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

const { meta, totals: t } = tourData;
// Shared links get the headline numbers, the dates and the intro, like
// the top of the page. Search results keep the plainer TOUR.description.
const shareDescription = `${fmtInt(Math.round(t.rideKm))} km ridden · ${fmtInt(t.gain)} m climbed · ${t.ridingDays} riding days, ${meta.dates}. ${meta.lede}`;

// The preview image (og:image and twitter:image) comes from
// opengraph-image.tsx alongside this file.
export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  openGraph: { type: "website", locale: "en_GB", title: meta.title, description: shareDescription },
  twitter: { card: "summary_large_image", title: meta.title, description: shareDescription },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#181614" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
