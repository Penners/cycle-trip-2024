import TourExplorer from "@/components/TourExplorer";
import { loadJournal } from "@/lib/journal";
import tourData from "@/data/tour.json";
import type { Tour } from "@/lib/types";

export default function Home() {
  const tour = tourData as unknown as Tour;
  return <TourExplorer tour={tour} journal={loadJournal()} />;
}
