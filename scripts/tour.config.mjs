// Hand-maintained facts the raw data can't tell us. Everything else
// (routes, distances, elevation, estimated fill-ins, photo positions) is
// derived from gpxdata/ and photos/ by tracks.mjs and build-data.mjs.

// The phone logged everything in UK time (BST), even on the continent,
// so all times here — and on the site — are UK time.
export const TIMEZONE_OFFSET_HOURS = 1;

// The camera (moto g9 plus) names photos IMG_YYYYMMDD_HHMMSS in its own
// local time, and switched to continental time on landing in France.
// Checked against landmarks: Dunkirk town hall at 13:37 and Nieuwpoort's
// Albert I memorial at 16:07 only line up with the track as UTC+2.
// Each entry applies from its UTC instant onwards.
export const CAMERA_CLOCK = [
  { from: "2024-04-01T00:00:00Z", offsetHours: 1 }, // UK
  { from: "2024-04-05T09:45:00Z", offsetHours: 2 }, // landed in Dunkirk
  { from: "2024-04-15T12:30:00Z", offsetHours: 1 }, // back in Dover
];

// Overnight stops — coordinates from the saved Google Maps list
// ("Cycle trip"). `night` is the date you went to sleep there.
export const stays = [
  { id: "dover", night: "2024-04-04", kind: "hostel", name: "Dover Sailing Hiking and Biking Hostel", place: "Dover", lat: 51.1264684, lon: 1.3257186 },
  { id: "memling", night: "2024-04-05", kind: "campsite", name: "Camping Memling", place: "Bruges", lat: 51.2071294, lon: 3.2630438 },
  { id: "antwerp", night: "2024-04-06", kind: "airbnb", name: "Airbnb", place: "Antwerp", lat: 51.2088372, lon: 4.4111779 },
  { id: "swinnenbos", night: "2024-04-07", kind: "campsite", name: "Het Swinnenbos", place: "Diest", lat: 51.0191779, lon: 5.0223838 },
  { id: "witven", night: "2024-04-08", kind: "campsite", name: "Camping Witven", place: "Veldhoven", lat: 51.3984758, lon: 5.4119194 },
  { id: "eikelaar", night: "2024-04-09", kind: "campsite", name: "Camping Eikelaar", place: "Overasselt", lat: 51.7687136, lon: 5.8066023 },
  { id: "oukoop", night: "2024-04-10", kind: "campsite", name: "Camping Oukoop", place: "Nieuwer Ter Aa, near Breukelen", lat: 52.1935702, lon: 4.9678693 },
  { id: "delft", night: "2024-04-11", kind: "airbnb", name: "Boat Airbnb", place: "Delft", lat: 52.0058274, lon: 4.3585176 },
  { id: "innerduyn", night: "2024-04-12", kind: "campsite", name: "Camping Innerduyn", place: "Biggekerke", lat: 51.4928189, lon: 3.50941 },
  { id: "kleinstrand", night: "2024-04-13", kind: "campsite", name: "Klein Strand", place: "Jabbeke, near Bruges", lat: 51.1843229, lon: 3.1011958 },
  { id: "dunkirk", night: "2024-04-14", kind: "airbnb", name: "Airbnb", place: "Dunkirk", lat: 51.0393736, lon: 2.3795849 },
];

// Stations used by several train legs.
const STN = {
  bristol: [51.4491, -2.5813],
  paddington: [51.5163, -0.1767],
  stPancras: [51.5322, -0.1263],
  doverPriory: [51.1255, 1.3051],
  arnhem: [51.9849, 5.8987],
  utrecht: [52.0894, 5.1101],
  breukelen: [52.1709, 5.0011],
  gouda: [52.0175, 4.7046],
  delft: [52.0067, 4.3565],
  rotterdam: [51.9244, 4.469],
};

// Dover Eastern Docks → Dunkirk (Loon-Plage), hand-drawn sea route for
// the DFDS crossings. The harbour exit follows photos taken from the deck.
const CHANNEL = [[51.1275, 1.338], [51.1263, 1.3382], [51.1234, 1.3404], [51.1213, 1.343], [51.1157, 1.3535], [51.1146, 1.3552], [51.07, 1.65], [51.045, 2.1], [51.025, 2.165], [51.0125, 2.188]];

// Non-cycling legs. `depart`/`arrive` are approximate UK times read off
// the gaps in the recordings; they order the day, and tracks.mjs fills
// only the gaps *around* them with estimated riding. Train geometry is
// routed along real railways by fetch-rail.mjs and cached in data/rail/.
export const transfers = [
  { id: "train-bristol-london", date: "2024-04-04", depart: "17:45", arrive: "19:43", mode: "train", name: "Bristol → London Paddington", note: "GWR into London", from: STN.bristol, to: STN.paddington, via: [] },
  { id: "train-london-dover", date: "2024-04-04", depart: "20:30", arrive: "21:50", mode: "train", name: "St Pancras → Dover Priory", note: "Southeastern high speed to the coast", from: STN.stPancras, to: STN.doverPriory, via: [] },
  { id: "ferry-dover-dunkirk", date: "2024-04-05", depart: "08:45", arrive: "10:50", mode: "ferry", name: "Dover → Dunkirk", note: "DFDS crossing (photos show it leaving Dover at 08:49)", path: [...CHANNEL, [51.00418, 2.19767]] },
  { id: "train-arnhem-utrecht", date: "2024-04-10", depart: "14:05", arrive: "14:45", mode: "train", name: "Arnhem → Utrecht", note: "Then cycled on to Breukelen and the campsite", from: STN.arnhem, to: STN.utrecht, via: [] },
  { id: "train-breukelen-utrecht", date: "2024-04-10", depart: "18:45", arrive: "19:05", mode: "train", name: "Breukelen → Utrecht", note: "Into Utrecht for food and beers", from: STN.breukelen, to: STN.utrecht, via: [] },
  { id: "train-utrecht-breukelen", date: "2024-04-10", depart: "22:05", arrive: "22:25", mode: "train", name: "Utrecht → Breukelen", note: "Back to camp", from: STN.utrecht, to: STN.breukelen, via: [] },
  { id: "train-breukelen-gouda", date: "2024-04-11", depart: "10:15", arrive: "11:05", mode: "train", name: "Breukelen → Gouda", note: "Via Utrecht, for the cheese museum", from: STN.breukelen, to: STN.gouda, via: [STN.utrecht] },
  { id: "train-delft-rotterdam", date: "2024-04-11", depart: "18:15", arrive: "18:45", mode: "train", name: "Delft → Rotterdam", note: "An evening in Rotterdam", from: STN.delft, to: STN.rotterdam, via: [] },
  { id: "train-rotterdam-delft", date: "2024-04-11", depart: "20:55", arrive: "21:20", mode: "train", name: "Rotterdam → Delft", note: "Back to the boat", from: STN.rotterdam, to: STN.delft, via: [] },
  // Taken mid-recording: waiting on the Maassluis quay at 09:39, next fix
  // on the Rozenburg bank at 09:58. Path from OSM way 140692791.
  { id: "ferry-maassluis-rozenburg", date: "2024-04-12", depart: "09:40", arrive: "09:58", mode: "ferry", name: "Maassluis → Rozenburg", note: "Ferry across the Nieuwe Waterweg", path: [[51.91462, 4.24921], [51.91373, 4.24878], [51.91257, 4.24795], [51.91183, 4.24726], [51.91144, 4.24633], [51.91139, 4.24464], [51.91144, 4.24312]] },
  { id: "ferry-vlissingen-breskens", date: "2024-04-13", depart: "10:50", arrive: "11:20", mode: "ferry", name: "Vlissingen → Breskens", note: "Foot and bike ferry across the Westerschelde", path: [[51.44407, 3.59713], [51.4425, 3.592], [51.42, 3.565], [51.401, 3.552], [51.39822, 3.5479]] },
  { id: "ferry-dunkirk-dover", date: "2024-04-15", depart: "10:00", arrive: "13:30", mode: "ferry", name: "Dunkirk → Dover", note: "DFDS crossing home", path: [[51.02069, 2.19231], ...[...CHANNEL].reverse()] },
  { id: "train-dover-london", date: "2024-04-15", depart: "17:30", arrive: "18:40", mode: "train", name: "Dover Priory → St Pancras", note: "Southeastern high speed", from: STN.doverPriory, to: STN.stPancras, via: [] },
  { id: "train-london-bristol", date: "2024-04-15", depart: "19:30", arrive: "21:10", mode: "train", name: "London Paddington → Bristol", note: "GWR home", from: STN.paddington, to: STN.bristol, via: [] },
];

// Per-day headline used in the sidebar and map tooltips.
export const dayTitles = {
  "2024-04-04": { title: "Bristol → London → Dover", subtitle: "Two trains and a ride across London" },
  "2024-04-05": { title: "Dover → Dunkirk → Bruges", subtitle: "Ferry over, then along the Flemish coast" },
  "2024-04-06": { title: "Bruges → Antwerp", subtitle: "Via Kaprijke, Zelzate & Moerbeke to the Scheldt" },
  "2024-04-07": { title: "Antwerp → Diest", subtitle: "Into the Kempen" },
  "2024-04-08": { title: "Diest → Veldhoven", subtitle: "Over the border into the Netherlands" },
  "2024-04-09": { title: "Veldhoven → Overasselt", subtitle: "North through Brabant to the Maas" },
  "2024-04-10": { title: "Overasselt → Arnhem → Utrecht → Breukelen", subtitle: "Train to Utrecht, ride to camp & back in for the evening" },
  "2024-04-11": { title: "Breukelen → Gouda → Delft", subtitle: "Cheese museum & a night on a boat" },
  "2024-04-12": { title: "Delft → Biggekerke", subtitle: "Over the Zeeland dams" },
  "2024-04-13": { title: "Biggekerke → Jabbeke", subtitle: "Westerschelde ferry & back into Belgium" },
  "2024-04-14": { title: "Jabbeke → Dunkirk", subtitle: "Along the coast into France" },
  "2024-04-15": { title: "Dunkirk → Dover → Bristol", subtitle: "Ferry & trains home" },
};
