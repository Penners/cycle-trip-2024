import type { NextConfig } from "next";
import { TIME_ZONE } from "./scripts/tour.config.mjs";

const nextConfig: NextConfig = {
  // Inlined into the client bundle for fmtTime (src/lib/format.ts).
  env: { TOUR_TIME_ZONE: TIME_ZONE },
};

export default nextConfig;
