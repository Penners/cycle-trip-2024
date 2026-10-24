"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, LayersControl, MapContainer, Marker, Pane, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Day, LatLon, Photo, Segment, Stay, Tour } from "@/lib/types";
import { fmtDate, fmtKm, fmtTime } from "@/lib/format";
import { TILE_LAYERS } from "@/lib/tiles";
import { COLORS } from "@/lib/colors";
import VectorTileLayer from "./VectorTileLayer";

type Props = {
  tour: Tour;
  selectedDayId: string | null;
  hoveredDayId: string | null;
  hoverPoint: LatLon | null;
  onSelectDay: (id: string | null) => void;
  onHoverDay: (id: string | null) => void;
  onOpenPhoto: (photo: Photo) => void;
  showPhotos: boolean;
  /** Overlay the original recordings exactly as the phone logged them. */
  showRaw: boolean;
};

/** Zoom level at which every photo switches from a dot to a thumbnail. */
const THUMB_ZOOM = 9;

const ICONS = {
  campsite: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`,
  hostel: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20V6"/><path d="M2 16h20v4"/><path d="M22 16v-4a3 3 0 0 0-3-3h-8v7"/><circle cx="6.5" cy="11.5" r="2"/></svg>`,
  airbnb: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>`,
};

function stayIcon(stay: Stay, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="stay-pin ${active ? "is-active" : ""}" data-kind="${stay.kind}">${ICONS[stay.kind]}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function photoIcon(photo: Photo) {
  return L.divIcon({
    className: "",
    html: `<div class="photo-pin"><img src="${photo.thumb}" alt="" loading="lazy"/></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// The flight and ferry would zoom the map out to Bristol, so the
// overview frames only the overland route.
// The UK legs (offTour) would pull the frame back to Bristol too.
const isOverland = (s: Segment) => s.kind !== "flight" && s.kind !== "ferry" && !s.offTour;
const allBounds = (days: Day[]) => L.latLngBounds(days.flatMap((d) => d.segments.filter(isOverland).flatMap((s) => s.coords)));

const PLANE = `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2c.8 0 1.4.9 1.4 2v5.2l7.6 4.4v2l-7.6-2.3v4.6l2.2 1.7V21L12 20l-3.6 1v-1.4l2.2-1.7v-4.6L3 15.6v-2l7.6-4.4V4c0-1.1.6-2 1.4-2z"/></svg>`;

function planeIcon(coords: LatLon[]) {
  // Rotate the plane to follow the arc at its midpoint.
  const i = Math.floor(coords.length / 2);
  const [a, b] = [coords[i - 1], coords[i + 1]];
  const k = Math.cos((a[0] * Math.PI) / 180);
  const bearing = (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
  return L.divIcon({
    className: "",
    html: `<div class="plane-pin" style="transform: rotate(${bearing}deg)">${PLANE}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitToSelection({ tour, selectedDayId }: { tour: Tour; selectedDayId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const day = tour.days.find((d) => d.id === selectedDayId);
    let bounds: L.LatLngBounds;
    if (day && day.segments.length) {
      const segs = day.segments.some(isOverland) ? day.segments.filter(isOverland) : day.segments;
      bounds = L.latLngBounds(segs.flatMap((s) => s.coords));
    } else if (day) {
      // Rest day: frame the photos and where we slept.
      const stay = tour.stays.find((s) => s.id === day.stayId);
      const pts: LatLon[] = day.photos.filter((p) => p.lat != null).map((p) => [p.lat!, p.lon!]);
      if (stay) pts.push([stay.lat, stay.lon]);
      bounds = L.latLngBounds(pts);
    } else {
      bounds = allBounds(tour.days);
    }
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 15 });
  }, [map, tour, selectedDayId]);
  return null;
}

export default function TourMap({ tour, selectedDayId, hoveredDayId, hoverPoint, onSelectDay, onHoverDay, onOpenPhoto, showPhotos, showRaw }: Props) {
  const selectedDay = tour.days.find((d) => d.id === selectedDayId) ?? null;
  const [zoom, setZoom] = useState(0);
  const allPhotos = useMemo(() => tour.days.flatMap((d) => d.photos).filter((p) => p.lat != null), [tour]);
  const initialBounds = useMemo(() => allBounds(tour.days), [tour]);

  // Draw the selected day last so it sits on top of its neighbours.
  const orderedDays = useMemo(
    () => [...tour.days].sort((a, b) => Number(a.id === selectedDayId) - Number(b.id === selectedDayId)),
    [tour, selectedDayId]
  );

  const activeStayIds = new Set<string>();
  if (selectedDay) {
    if (selectedDay.stayId) activeStayIds.add(selectedDay.stayId);
    const prev = tour.days.find((d) => d.index === selectedDay.index - 1);
    if (prev?.stayId) activeStayIds.add(prev.stayId);
  }

  return (
    <MapContainer bounds={initialBounds} boundsOptions={{ padding: [40, 40] }} className="tour-map" zoomControl={false} scrollWheelZoom>
      <LayersControl position="topright">
        {TILE_LAYERS.map((t, i) => (
          <LayersControl.BaseLayer key={t.id} name={t.name} checked={i === 0}>
            {t.type === "vector" ? (
              <VectorTileLayer style={t.style} attribution={t.attribution} />
            ) : (
              <TileLayer url={t.url} attribution={t.attribution} maxZoom={t.maxZoom} subdomains={t.subdomains ?? "abc"} />
            )}
          </LayersControl.BaseLayer>
        ))}
      </LayersControl>
      <ZoomBottomLeft />
      <ZoomWatcher onZoom={setZoom} />
      {selectedDayId && <DeselectOnEmptyClick onDeselect={() => onSelectDay(null)} />}
      <FitToSelection tour={tour} selectedDayId={selectedDayId} />

      <Pane name="routes" style={{ zIndex: 410 }}>
        {orderedDays.map((day) => {
          const selected = day.id === selectedDayId;
          const hovered = day.id === hoveredDayId;
          const dimmed = selectedDayId !== null && !selected;
          const handlers = {
            click: () => onSelectDay(day.id),
            mouseover: () => onHoverDay(day.id),
            mouseout: () => onHoverDay(null),
          };
          return day.segments.map((seg) => {
            const key = `${day.id}-${seg.id}-${selected ? "on" : "off"}`;
            const tooltip = (
              <Tooltip sticky className="route-tooltip">
                <strong>Day {day.index} · {fmtDate(day.date)}</strong>
                <br />
                {seg.kind === "ride" ? `${day.title} · ${fmtKm(seg.km)} km` : `${MODE_EMOJI[seg.kind]} ${seg.name} · ${fmtKm(seg.km)} km`}
              </Tooltip>
            );
            if (seg.offTour) {
              // Getting to and from the tour: a light dashed line, like the 2026 flight.
              return (
                <Polyline
                  key={key}
                  positions={seg.coords}
                  pathOptions={{ bubblingMouseEvents: false, color: COLORS.offTour, weight: 2, opacity: dimmed && !hovered ? 0.4 : 0.8, dashArray: "6 7", lineCap: "butt" }}
                  eventHandlers={handlers}
                >
                  {tooltip}
                </Polyline>
              );
            }
            if (seg.kind === "ride") {
              return (
                <Fragment key={key}>
                  <Polyline
                    positions={seg.coords}
                    pathOptions={{ bubblingMouseEvents: false, color: COLORS.casing, weight: selected || hovered ? 9 : 6, opacity: dimmed && !hovered ? 0.4 : 0.95, lineCap: "round", lineJoin: "round" }}
                    eventHandlers={handlers}
                  />
                  <Polyline
                    positions={seg.coords}
                    pathOptions={{ bubblingMouseEvents: false,
                      color: dimmed && !hovered ? COLORS.routeDim : COLORS.route,
                      weight: selected || hovered ? 5 : 3.5,
                      opacity: dimmed && !hovered ? 0.85 : 1,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                    eventHandlers={handlers}
                  >
                    {tooltip}
                  </Polyline>
                </Fragment>
              );
            }
            if (seg.kind === "train") {
              // Classic railway symbol: dark line with white "sleepers".
              return (
                <Fragment key={key}>
                  <Polyline positions={seg.coords} pathOptions={{ bubblingMouseEvents: false, color: COLORS.rail, weight: selected || hovered ? 7 : 6, opacity: dimmed && !hovered ? 0.45 : 1, lineCap: "butt" }} eventHandlers={handlers} />
                  <Polyline positions={seg.coords} pathOptions={{ bubblingMouseEvents: false, color: COLORS.railDash, weight: selected || hovered ? 3 : 2.5, opacity: dimmed && !hovered ? 0.6 : 1, dashArray: "7 7", lineCap: "butt" }} eventHandlers={handlers}>
                    {tooltip}
                  </Polyline>
                </Fragment>
              );
            }
            if (seg.kind === "flight") {
              return (
                <Fragment key={key}>
                  <Polyline
                    positions={seg.coords}
                    pathOptions={{ bubblingMouseEvents: false, color: COLORS.flight, weight: 2, opacity: dimmed && !hovered ? 0.45 : 0.9, dashArray: "10 8", lineCap: "butt" }}
                    eventHandlers={handlers}
                  >
                    {tooltip}
                  </Polyline>
                  <Marker position={seg.coords[Math.floor(seg.coords.length / 2)]} icon={planeIcon(seg.coords)} eventHandlers={handlers} />
                </Fragment>
              );
            }
            return (
              <Polyline
                key={key}
                positions={seg.coords}
                pathOptions={{ bubblingMouseEvents: false, color: COLORS.ferry, weight: 4, opacity: dimmed && !hovered ? 0.5 : 1, dashArray: "1 9", lineCap: "round" }}
                eventHandlers={handlers}
              >
                {tooltip}
              </Polyline>
            );
          });
        })}
      </Pane>

      {/* What the phone actually recorded: a thin line through every fix
          (walks dotted), dots where a jump starts or ends, with the time. */}
      <Pane name="raw" style={{ zIndex: 420 }} />
      {showRaw &&
        tour.days
          .filter((d) => !selectedDayId || d.id === selectedDayId)
          .flatMap((day) =>
            day.raw.map((r, i) => (
              <Fragment key={`raw-${day.id}-${i}`}>
                <Polyline
                  pane="raw"
                  positions={r.coords}
                  interactive={false}
                  pathOptions={{ color: COLORS.raw, weight: 1.5, opacity: 0.9, dashArray: r.sport === "walk" ? "2 4" : undefined }}
                />
                {r.fixes.map(([lat, lon, t]) => (
                  <CircleMarker
                    key={t + lat}
                    pane="raw"
                    center={[lat, lon]}
                    radius={3}
                    pathOptions={{ bubblingMouseEvents: false, color: "#ffffff", weight: 1, fillColor: COLORS.raw, fillOpacity: 1 }}
                  >
                    <Tooltip direction="top" offset={[0, -4]}>
                      {r.sport === "walk" ? "Walk" : "Ride"} fix · {fmtTime(t)}
                    </Tooltip>
                  </CircleMarker>
                ))}
              </Fragment>
            ))
          )}

      {tour.stays.map((stay) => {
        const nights = tour.days.filter((d) => d.stayId === stay.id);
        return (
          <Marker key={stay.id} position={[stay.lat, stay.lon]} icon={stayIcon(stay, activeStayIds.has(stay.id))} zIndexOffset={activeStayIds.has(stay.id) ? 500 : 0}>
            <Popup>
              <div className="stay-popup">
                <div className="eyebrow">{{ campsite: "Campsite", airbnb: "Airbnb", hostel: "Hostel" }[stay.kind]} · {nights.map((d) => fmtDate(d.date)).join(" & ")}</div>
                <strong>{stay.name}</strong>
                <div>{stay.place}</div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Photos: small dots along the route, thumbnails for the selected
          day or once zoomed in. Hover any of them for a preview. */}
      <Pane name="photo-dots" style={{ zIndex: 610 }} />
      {showPhotos &&
        allPhotos.map((p) => {
          const preview = (
            <Tooltip direction="top" offset={[0, -10]} className="photo-tooltip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" width={120} height={120} />
              {p.caption && <span>{p.caption}</span>}
            </Tooltip>
          );
          if (p.date === selectedDayId || zoom >= THUMB_ZOOM) {
            return (
              <Marker
                key={p.id}
                position={[p.lat!, p.lon!]}
                icon={photoIcon(p)}
                eventHandlers={{ click: () => onOpenPhoto(p) }}
                // The selected day's photos sit on top; neighbouring days' fade back.
                opacity={selectedDayId && p.date !== selectedDayId ? 0.5 : 1}
                zIndexOffset={selectedDayId && p.date !== selectedDayId ? 900 : 1000}
              >
                {preview}
              </Marker>
            );
          }
          const dimmed = selectedDayId !== null;
          return (
            <CircleMarker
              key={p.id}
              pane="photo-dots"
              center={[p.lat!, p.lon!]}
              radius={4.5}
              pathOptions={{ bubblingMouseEvents: false, color: COLORS.ink, weight: 1.5, fillColor: "#ffffff", fillOpacity: 1, opacity: dimmed ? 0.45 : 1 }}
              eventHandlers={{ click: () => onOpenPhoto(p) }}
            >
              {preview}
            </CircleMarker>
          );
        })}

      <Pane name="hover" style={{ zIndex: 650 }} />
      {hoverPoint && (
        <CircleMarker
          pane="hover" center={hoverPoint} radius={7} pathOptions={{ bubblingMouseEvents: false, color: "#ffffff", weight: 3, fillColor: COLORS.ink, fillOpacity: 1 }} interactive={false} />
      )}
    </MapContainer>
  );
}


const MODE_EMOJI = { train: "🚆", ferry: "⛴", flight: "✈" } as const;

/**
 * Clicking empty map (not a route, pin or photo) returns to the whole tour.
 * Waits out a possible double-click so double-click-to-zoom doesn't
 * deselect, and a click that only closes an open popup does nothing else.
 */
function DeselectOnEmptyClick({ onDeselect }: { onDeselect: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Leaflet closes an open popup just before the map's click fires.
  const popupClosedAt = useRef(0);
  useMapEvents({
    popupclose: () => {
      popupClosedAt.current = Date.now();
    },
    click: () => {
      if (Date.now() - popupClosedAt.current < 300) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(onDeselect, 280);
    },
    dblclick: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return null;
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => report() });
  const report = () => {
    map.getContainer().dataset.zoom = String(map.getZoom());
    onZoom(map.getZoom());
  };
  useEffect(report, [map, onZoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ZoomBottomLeft() {
  const map = useMap();
  useEffect(() => {
    const zoom = L.control.zoom({ position: "bottomright" });
    zoom.addTo(map);
    return () => {
      zoom.remove();
    };
  }, [map]);
  return null;
}
