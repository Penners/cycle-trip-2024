export type LatLon = [number, number];
/** [km along day, elevation m, lat, lon] — null marks a break (train/ferry). */
export type ProfilePoint = [number, number, number, number];

export type Segment =
  | {
      kind: "ride";
      id: string;
      /** Getting to/from the tour: drawn, not counted. */
      offTour?: boolean;
      /** The Strava activity, when the ride is exactly one. */
      stravaId?: string;
      date: string;
      start: string;
      end: string;
      km: number;
      movingSeconds: number;
      elapsedSeconds: number;
      gain: number;
      loss: number;
      coords: LatLon[];
    }
  | {
      kind: "train" | "ferry" | "flight";
      id: string;
      /** Getting to/from the tour: drawn, not counted. */
      offTour?: boolean;
      date: string;
      /** Approximate local times, when the config gives them. */
      start?: string;
      end?: string;
      name: string;
      note: string;
      km: number;
      coords: LatLon[];
    };

export type Photo = {
  id: string;
  kind: "photo" | "pano";
  takenAt: string;
  date: string;
  lat: number | null;
  lon: number | null;
  width: number;
  height: number;
  src: string;
  thumb: string;
  /** Tiny inline image (data URI) shown blurred while the full photo loads. */
  blur: string;
  caption: string;
  /** Who took it, when it's someone else's photo. */
  credit?: string;
  km: number | null;
};

export type Band = { kind: "train" | "ferry"; name: string; from: number; to: number };

/** An original recording as the phone logged it, for the raw GPS overlay. */
export type RawTrack = {
  sport: "ride" | "walk";
  coords: LatLon[];
  /** Fixes at either end of a jump: [lat, lon, ISO time]. */
  fixes: [number, number, string][];
};

/** Historical weather (Open-Meteo / ERA5) for a day's riding. */
export type Weather = {
  /** Daytime high, °C, where the middle of the day's riding was. */
  high: number | null;
  /** Overnight low at that night's stay, °C. */
  low: number | null;
  rainMm: number | null;
  /** Mean wind while riding, and where it came from. */
  windKmh: number | null;
  windFrom: string | null;
  gustKmh: number | null;
  /** Mean wind along the direction of travel: positive into your face, negative behind. */
  headwindKmh: number | null;
  /** % of riding time with more than 10 km/h of headwind. */
  headwindShare: number | null;
  /** Mean cloud cover while riding, %. */
  cloudPct: number | null;
  /** Hours of sunshine while riding. */
  sunHours: number | null;
  /** Solar energy ridden under, kWh/m². */
  sunKwh: number | null;
};

export type Day = {
  id: string;
  index: number;
  date: string;
  title: string;
  subtitle: string;
  /** Shown in place of the elevation chart on a day without riding. */
  noRide?: string;
  stats: {
    rideKm: number;
    trainKm: number;
    gain: number;
    loss: number;
    movingSeconds: number;
    maxEle: number | null;
    minEle: number | null;
  };
  stayId: string | null;
  segments: Segment[];
  profile: (ProfilePoint | null)[];
  bands: Band[];
  photos: Photo[];
  raw: RawTrack[];
  weather: Weather;
};

export type Stay = {
  id: string;
  night: string;
  nights?: number;
  kind: "campsite" | "airbnb" | "hostel";
  name: string;
  place: string;
  lat: number;
  lon: number;
};

/** Masthead text and page metadata, from TOUR in scripts/tour.config.mjs. */
export type TourMeta = {
  title: string;
  from: string;
  to: string;
  dates: string;
  riders: string;
  lede: string;
  description: string;
};

export type Tour = {
  meta: TourMeta;
  totals: {
    rideKm: number;
    trainKm: number;
    ferryKm: number;
    flightKm: number;
    gain: number;
    loss: number;
    maxEle: number;
    movingSeconds: number;
    ridingDays: number;
    nights: number;
    photos: number;
  };
  stays: Stay[];
  days: Day[];
};

export type Journal = {
  intro: string;
  days: Record<string, string>;
};
