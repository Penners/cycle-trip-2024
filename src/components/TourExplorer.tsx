"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import ElevationChart, { type ChartMarker } from "./ElevationChart";
import Lightbox from "./Lightbox";
import type { Band, Day, Journal, LatLon, Photo, ProfilePoint, Tour } from "@/lib/types";
import { fmtDate, fmtDuration, fmtInt, fmtKm, fmtTime } from "@/lib/format";

const TourMap = dynamic(() => import("./TourMap"), {
  ssr: false,
  loading: () => <div className="tour-map map-loading">Loading map…</div>,
});

type Props = { tour: Tour; journal: Journal };

export default function TourExplorer({ tour, journal }: Props) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [hoveredDayId, setHoveredDayId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<LatLon | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  // Remember the photo toggle per viewer (storage may be unavailable).
  useEffect(() => {
    try {
      if (localStorage.getItem("showPhotos") === "0") setShowPhotos(false);
    } catch {}
  }, []);
  const toggleShowPhotos = () => {
    setShowPhotos((v) => {
      try {
        localStorage.setItem("showPhotos", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  // Every photo in trip order, so the lightbox can scrub the whole set.
  const allPhotos = useMemo(() => tour.days.flatMap((d) => d.photos), [tour]);

  const selectedDay = tour.days.find((d) => d.id === selectedDayId) ?? null;

  // Shareable ?day=YYYY-MM-DD links.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("day");
    if (d && tour.days.some((x) => x.id === d)) setSelectedDayId(d);
  }, [tour]);

  const selectDay = useCallback((id: string | null) => {
    setSelectedDayId(id);
    setHoverPoint(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("day", id);
    else url.searchParams.delete("day");
    window.history.replaceState(null, "", url);
    // Phones scroll the whole page (map on top); desktop scrolls the sidebar.
    if (window.matchMedia("(max-width: 900px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    else document.querySelector(".sidebar-scroll")?.scrollTo({ top: 0 });
  }, []);

  const dayLabel = useCallback(
    (p: Photo) => {
      const d = tour.days.find((x) => x.id === p.date);
      return d ? `Day ${d.index} · ${d.title}` : "";
    },
    [tour]
  );

  const openPhoto = useCallback((photo: Photo) => setLightboxIndex(allPhotos.findIndex((p) => p.id === photo.id)), [allPhotos]);

  // Whole-tour profile for the overview: days laid end to end.
  const overview = useMemo(() => {
    const profile: (ProfilePoint | null)[] = [];
    const bands: Band[] = [];
    const dividers: ChartMarker[] = [];
    const ranges: { day: Day; from: number; to: number }[] = [];
    const photos: Photo[] = [];
    let offset = 0;
    for (const day of tour.days) {
      if (!day.segments.some((s) => s.kind === "ride" && !s.offTour)) continue;
      const length = day.segments.reduce((a, s) => a + (s.kind === "flight" || s.kind === "ferry" || s.offTour ? 0 : s.km), 0);
      if (offset > 0) dividers.push({ km: offset, label: day.title });
      for (const p of day.profile) profile.push(p ? [p[0] + offset, p[1], p[2], p[3]] : null);
      profile.push(null);
      for (const b of day.bands) bands.push({ ...b, from: b.from + offset, to: b.to + offset });
      ranges.push({ day, from: offset, to: offset + length });
      for (const p of day.photos) if (p.km !== null) photos.push({ ...p, km: p.km + offset });
      offset += length;
    }
    return { profile, bands, dividers, ranges, photos };
  }, [tour]);

  const dayAtKm = useCallback((km: number) => overview.ranges.find((r) => km >= r.from && km <= r.to)?.day ?? null, [overview]);

  const maxDayKm = Math.max(...tour.days.map((d) => d.stats.rideKm + d.stats.trainKm));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          {selectedDay ? (
            <DayDetail
              day={selectedDay}
              tour={tour}
              markdown={journal.days[selectedDay.id] ?? ""}
              onBack={() => selectDay(null)}
              onSelectDay={selectDay}
              onOpenPhoto={openPhoto}
            />
          ) : (
            <Overview tour={tour} journal={journal} maxDayKm={maxDayKm} hoveredDayId={hoveredDayId} onHoverDay={setHoveredDayId} onSelectDay={selectDay} onOpenPhoto={openPhoto} />
          )}
        </div>
      </aside>

      <section className="map-column">
        <div className="map-wrap">
          <TourMap
            tour={tour}
            selectedDayId={selectedDayId}
            hoveredDayId={hoveredDayId}
            hoverPoint={hoverPoint}
            onSelectDay={selectDay}
            onHoverDay={setHoveredDayId}
            onOpenPhoto={openPhoto}
            showPhotos={showPhotos}
            showRaw={showRaw}
          />
          <div className="map-toggles">
          <button className={`map-toggle ${showPhotos ? "is-on" : ""}`} onClick={toggleShowPhotos} aria-pressed={showPhotos}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {showPhotos ? "Hide photos" : `Show ${allPhotos.length} photos`}
          </button>
          {/* The raw recording is only useful for checking the routes, so the
              toggle only exists under `next dev` (the data isn't shipped
              to the public site either; see page.tsx). */}
          {process.env.NODE_ENV === "development" && (
            <button
              className={`map-toggle ${showRaw ? "is-on" : ""}`}
              onClick={() => setShowRaw((v) => !v)}
              aria-pressed={showRaw}
              title="Overlay exactly what the phone recorded"
            >
              <span className="sw sw-raw" aria-hidden />
              {showRaw ? "Hide raw GPS" : "Show raw GPS"}
            </button>
          )}
          </div>
          <Legend showRaw={showRaw} />
        </div>
        <div className="elevation-panel">
          <div className="elevation-head">
            <span className="eyebrow">Elevation (m)</span>
            <span className="elevation-title">
              {selectedDay
                ? selectedDay.profile.length
                  ? `Day ${selectedDay.index} · ${selectedDay.title}`
                  : `Day ${selectedDay.index} · no riding`
                : "Whole tour — click to jump to a day"}
            </span>
            {selectedDay && (
              <button className="elevation-back" onClick={() => selectDay(null)}>
                ← Whole tour
              </button>
            )}
          </div>
          {selectedDay ? (
            selectedDay.profile.some(Boolean) ? (
              <ElevationChart
                key={selectedDay.id}
                profile={selectedDay.profile}
                bands={selectedDay.bands}
                photos={showPhotos ? selectedDay.photos : []}
                onHover={setHoverPoint}
                onOpenPhoto={openPhoto}
              />
            ) : (
              <div className="elevation-empty">{selectedDay.segments.some((s) => s.offTour) ? "Getting to the start: not part of the tour's charts." : "No riding today."}</div>
            )
          ) : (
            <ElevationChart
              key="overview"
              profile={overview.profile}
              bands={overview.bands}
              dividers={overview.dividers}
              photos={showPhotos ? overview.photos : []}
              onOpenPhoto={openPhoto}
              labelFor={(km) => {
                const d = dayAtKm(km);
                return d ? `Day ${d.index} · ${fmtDate(d.date)}` : null;
              }}
              onHover={setHoverPoint}
              onPickKm={(km) => {
                const d = dayAtKm(km);
                if (d) selectDay(d.id);
              }}
            />
          )}
        </div>
      </section>

      <Lightbox photos={allPhotos} index={lightboxIndex} dayLabel={dayLabel} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
    </div>
  );
}

function Overview({
  tour,
  journal,
  maxDayKm,
  hoveredDayId,
  onHoverDay,
  onSelectDay,
  onOpenPhoto,
}: {
  tour: Tour;
  journal: Journal;
  maxDayKm: number;
  hoveredDayId: string | null;
  onHoverDay: (id: string | null) => void;
  onSelectDay: (id: string) => void;
  onOpenPhoto: (p: Photo) => void;
}) {
  const t = tour.totals;
  return (
    <>
      <header className="masthead">
        <div className="eyebrow">4 – 15 April 2024 · Mike, Ronaldo &amp; me</div>
        <h1>
          Flanders <span className="arrow">→</span> Holland
        </h1>
        <p className="lede">Twelve days from Dunkirk through Bruges, Antwerp and Brabant to Utrecht and Delft, then back down the Zeeland coast, with trains and ferries at either end.</p>
      </header>

      <dl className="stats">
        <Stat label="Ridden" value={fmtInt(Math.round(t.rideKm))} unit="km" />
        <Stat label="By train" value={fmtInt(Math.round(t.trainKm))} unit="km" />
        <Stat label="Moving" value={fmtDuration(t.movingSeconds).replace(/ \d+m$/, "")} unit="" />
        <Stat label="Climbed" value={fmtInt(t.gain)} unit="m" />
        <Stat label="Descended" value={fmtInt(t.loss)} unit="m" />
        <Stat label="Highest" value={fmtInt(t.maxEle)} unit="m" />
        <Stat label="Riding days" value={String(t.ridingDays)} unit="" />
        <Stat label="Nights out" value={String(t.nights)} unit="" />
        <Stat label="Photos" value={String(t.photos)} unit="" />
      </dl>

      <h2 className="section-title">The days</h2>
      <ol className="day-list">
        {tour.days.map((day) => {
          const rideW = (day.stats.rideKm / maxDayKm) * 100;
          const trainW = (day.stats.trainKm / maxDayKm) * 100;
          return (
            <li key={day.id}>
              <button
                className={`day-row ${hoveredDayId === day.id ? "is-hovered" : ""}`}
                onClick={() => onSelectDay(day.id)}
                onMouseEnter={() => onHoverDay(day.id)}
                onMouseLeave={() => onHoverDay(null)}
              >
                <span className="day-num">{day.index}</span>
                <span className="day-main">
                  <span className="day-date">{fmtDate(day.date)}</span>
                  <span className="day-title">{day.title}</span>
                  <span className="day-bar" aria-hidden>
                    {rideW > 0 && <span className="bar-ride" style={{ width: `${rideW}%` }} />}
                    {trainW > 0 && <span className="bar-train" style={{ width: `${trainW}%` }} />}
                  </span>
                </span>
                <span className="day-km">
                  {day.stats.rideKm > 0 ? (
                    <>
                      <strong>{fmtKm(day.stats.rideKm)}</strong> km
                      {day.stats.trainKm > 0 && <em>+{Math.round(day.stats.trainKm)} train</em>}
                    </>
                  ) : (
                    <em>{day.segments.some((s) => s.offTour) ? "getting there" : day.segments.some((s) => s.kind === "ferry") ? "ferry" : "rest"}</em>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="prose intro">
        <ReactMarkdown>{journal.intro}</ReactMarkdown>
      </section>

      {/* Every photo, a block per day, so they can be browsed without
          opening each day first. */}
      <h2 className="section-title">Photos</h2>
      {tour.days
        .filter((day) => day.photos.length > 0)
        .map((day) => (
          <section key={day.id} className="photo-day">
            <button className="photo-day-head" onClick={() => onSelectDay(day.id)}>
              <span className="day-date">Day {day.index} · {fmtDate(day.date)}</span>
              <span className="photo-day-title">{day.title}</span>
            </button>
            <div className="photo-grid">
              {day.photos.map((p) => (
                <button key={p.id} className={`photo-tile ${p.kind === "pano" ? "is-pano" : ""}`} onClick={() => onOpenPhoto(p)} title={p.caption}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb} alt={p.caption || `Photo taken ${fmtTime(p.takenAt)}`} loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        ))}
    </>
  );
}

function DayDetail({
  day,
  tour,
  markdown,
  onBack,
  onSelectDay,
  onOpenPhoto,
}: {
  day: Day;
  tour: Tour;
  markdown: string;
  onBack: () => void;
  onSelectDay: (id: string) => void;
  onOpenPhoto: (p: Photo) => void;
}) {
  const prev = tour.days.find((d) => d.index === day.index - 1);
  const next = tour.days.find((d) => d.index === day.index + 1);
  const stay = tour.stays.find((s) => s.id === day.stayId);

  return (
    <article className="day-detail">
      <nav className="day-nav">
        <button className="link-btn" onClick={onBack}>
          ← All days
        </button>
        <span className="day-nav-arrows">
          <button className="icon-btn" disabled={!prev} onClick={() => prev && onSelectDay(prev.id)} aria-label="Previous day">
            ‹
          </button>
          <button className="icon-btn" disabled={!next} onClick={() => next && onSelectDay(next.id)} aria-label="Next day">
            ›
          </button>
        </span>
      </nav>

      <header className="masthead small">
        <div className="eyebrow">
          Day {day.index} · {fmtDate(day.date, { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1>{day.title}</h1>
        <p className="lede">{day.subtitle}</p>
      </header>

      {day.stats.rideKm > 0 && (
        <dl className="stats">
          <Stat label="Ridden" value={fmtKm(day.stats.rideKm)} unit="km" />
          {day.stats.trainKm > 0 ? (
            <Stat label="By train" value={fmtKm(day.stats.trainKm)} unit="km" />
          ) : (
            <Stat label="Avg speed" value={(day.stats.rideKm / (day.stats.movingSeconds / 3600)).toFixed(1)} unit="km/h" />
          )}
          <Stat label="Climbed" value={fmtInt(day.stats.gain)} unit="m" />
          <Stat label="Descended" value={fmtInt(day.stats.loss)} unit="m" />
          <Stat label="Moving" value={fmtDuration(day.stats.movingSeconds)} unit="" />
          <Stat label="Highest" value={fmtInt(day.stats.maxEle ?? 0)} unit="m" />
        </dl>
      )}

      <WeatherCard weather={day.weather} />

      {day.segments.length > 0 && (
        <ol className="legs">
          {day.segments.map((s) => (
            <li key={s.id} className={`leg leg-${s.kind}`}>
              <span className="leg-swatch" aria-hidden />
              {s.kind === "ride" ? (
                <>
                  <span className="leg-name">
                    Ride · {fmtTime(s.start)}–{fmtTime(s.end)}
                  </span>
                  <span className="leg-km">{fmtKm(s.km)} km</span>
                </>
              ) : (
                <>
                  <span className="leg-name">
                    {{ train: "Train", ferry: "Ferry", flight: "Flight" }[s.kind]} · {s.name}
                  </span>
                  <span className="leg-km">{fmtKm(s.km)} km</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {stay && (
        <div className="stay-card">
          <span className="eyebrow">{stay.kind === "campsite" ? "Camped at" : "Slept at"}</span>
          <strong>{stay.name}</strong>
          <span>{stay.place}</span>
        </div>
      )}

      {day.photos.length > 0 && (
        <div className="photo-grid">
          {day.photos.map((p) => (
            <button key={p.id} className={`photo-tile ${p.kind === "pano" ? "is-pano" : ""}`} onClick={() => onOpenPhoto(p)} title={p.caption}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.caption || `Photo taken ${fmtTime(p.takenAt)}`} loading="lazy" />
              <span className="photo-time">{fmtTime(p.takenAt)}</span>
            </button>
          ))}
        </div>
      )}

      <section className="prose">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </section>

      <nav className="day-footer-nav">
        {prev ? (
          <button className="link-btn" onClick={() => onSelectDay(prev.id)}>
            ← Day {prev.index}: {prev.title}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button className="link-btn" onClick={() => onSelectDay(next.id)}>
            Day {next.index}: {next.title} →
          </button>
        )}
      </nav>
    </article>
  );
}

function WeatherCard({ weather: w }: { weather: Day["weather"] }) {
  if (w.high == null) return null;
  const tail = w.headwindKmh != null && w.headwindKmh < 0;
  return (
    <section className="weather-card">
      <span className="eyebrow">Weather</span>
      <dl className="stats">
        <Stat label="High" value={w.high.toFixed(0)} unit="°C" />
        {w.low != null && <Stat label="Overnight low" value={w.low.toFixed(0)} unit="°C" />}
        {w.rainMm != null && <Stat label="Rain" value={w.rainMm.toFixed(1)} unit="mm" />}
        {w.windKmh != null && <Stat label={`Wind from ${w.windFrom}`} value={w.windKmh.toFixed(0)} unit="km/h" />}
        {w.gustKmh != null && <Stat label="Gusts to" value={String(w.gustKmh)} unit="km/h" />}
        {w.headwindKmh != null && (
          <Stat label={tail ? "Tailwind" : "Headwind"} value={Math.abs(w.headwindKmh).toFixed(0)} unit="km/h" />
        )}
        {w.cloudPct != null && <Stat label="Cloud" value={String(w.cloudPct)} unit="%" />}
        {w.sunHours != null && <Stat label="Sunshine" value={w.sunHours.toFixed(1)} unit="h" />}
      </dl>
      {w.headwindKmh != null && w.headwindShare != null && w.headwindShare >= 50 && (
        <p className="weather-note">Into a headwind of 10+ km/h for {w.headwindShare}% of the riding.</p>
      )}
      {w.cloudPct != null && w.sunHours != null && w.cloudPct >= 80 && w.sunHours >= 3 && (
        <p className="weather-note">Looked overcast, but {w.sunHours.toFixed(1)} h of sun came through thin high cloud while riding.</p>
      )}
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <span className="unit"> {unit}</span>}
      </dd>
    </div>
  );
}

function Legend({ showRaw }: { showRaw: boolean }) {
  return (
    <div className="legend" aria-label="Map legend">
      <span className="legend-item">
        <span className="sw sw-ride" /> Ride
      </span>
      {showRaw && (
        <span className="legend-item">
          <span className="sw sw-raw" /> Raw GPS
        </span>
      )}
      <span className="legend-item">
        <span className="sw sw-train" /> Train
      </span>
      <span className="legend-item">
        <span className="sw sw-ferry" /> Ferry
      </span>
      <span className="legend-item">
        <span className="sw sw-camp">⛺</span> Overnight
      </span>
    </div>
  );
}
