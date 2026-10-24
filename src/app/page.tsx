import TourExplorer from "@/components/TourExplorer";
import { loadJournal } from "@/lib/journal";
import tourData from "@/data/tour.json";
import type { Tour } from "@/lib/types";

export default function Home() {
  const tour = tourData as unknown as Tour;
  // The raw GPS overlay is a dev-only tool, so don't ship its data publicly.
  const shipped = process.env.NODE_ENV === "development" ? tour : { ...tour, days: tour.days.map((d) => ({ ...d, raw: [] })) };
  return <TourExplorer tour={shipped} journal={loadJournal()} />;
}
