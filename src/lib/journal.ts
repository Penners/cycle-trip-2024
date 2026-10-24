import fs from "node:fs";
import path from "node:path";
import type { Journal } from "./types";

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
  July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
};

/**
 * Splits content/journal.md into the overview and one markdown chunk per
 * day, keyed by ISO date, using the `### **Friday, 18 September 2026**`
 * headings.
 */
export function loadJournal(): Journal {
  const md = fs.readFileSync(path.join(process.cwd(), "content/journal.md"), "utf8");
  const parts = md.split(/^### /m);
  const days: Record<string, string> = {};

  for (const part of parts.slice(1)) {
    const [heading, ...rest] = part.split("\n");
    const m = heading.match(/(\d{1,2}) (\w+) (\d{4})/);
    if (!m) continue;
    const date = `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
    days[date] = rest.join("\n").replace(/\n---\s*$/m, "").trim();
  }

  const overview = parts[0].match(/## 📌 Tour Overview\n([\s\S]*?)\n---/);
  return { intro: overview?.[1].trim() ?? "", days };
}
