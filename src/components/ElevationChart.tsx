"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Band, LatLon, Photo, ProfilePoint } from "@/lib/types";
import { fmtInt, fmtKm } from "@/lib/format";

export type ChartMarker = { km: number; label: string };

type Props = {
  profile: (ProfilePoint | null)[];
  bands: Band[];
  photos?: Photo[];
  /** Day boundaries in overview mode. */
  dividers?: ChartMarker[];
  /** Resolve the label for a hovered km (e.g. which day it's on). */
  labelFor?: (km: number) => string | null;
  onHover: (p: LatLon | null) => void;
  onOpenPhoto?: (p: Photo) => void;
  onPickKm?: (km: number) => void;
};

type Domain = [number, number];

const M = { top: 14, right: 14, bottom: 24, left: 46 };

function niceStep(range: number, target: number) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export default function ElevationChart({ profile, bands, photos = [], dividers = [], labelFor, onHover, onOpenPhoto, onPickKm }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [size, setSize] = useState({ w: 800, h: 160 });
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(() => profile.filter((p): p is ProfilePoint => p !== null), [profile]);
  const maxKm = Math.max(pts.at(-1)?.[0] ?? 0, ...bands.map((b) => b.to), 1);
  const iw = Math.max(10, size.w - M.left - M.right);
  const ih = Math.max(10, size.h - M.top - M.bottom);

  // ---------- zoom: the visible km window ----------
  const [zoom, setZoom] = useState<Domain | null>(null); // null = whole profile
  const [d0, d1] = zoom ?? [0, maxKm];
  const minSpan = Math.min(maxKm, Math.max(0.5, maxKm / 200));

  /** Keep a window inside [0, maxKm] and no narrower than minSpan; null once fully zoomed out. */
  const clampDomain = (a: number, b: number): Domain | null => {
    const span = Math.min(maxKm, Math.max(minSpan, b - a));
    if (span >= maxKm - 1e-6) return null;
    const start = Math.min(maxKm - span, Math.max(0, a));
    return [start, start + span];
  };
  const kmAtPx = (px: number, dom: Domain = [d0, d1]) => dom[0] + ((px - M.left) / iw) * (dom[1] - dom[0]);
  const zoomAround = (km: number, factor: number, dom: Domain = [d0, d1]) =>
    clampDomain(km - (km - dom[0]) * factor, km - (km - dom[0]) * factor + (dom[1] - dom[0]) * factor);
  const panByPx = (dx: number, dom: Domain = [d0, d1]) => {
    const dk = (dx / iw) * (dom[1] - dom[0]);
    return clampDomain(dom[0] - dk, dom[1] - dk);
  };

  // Native wheel listener: React's is passive, and we need preventDefault.
  const latest = useRef({ d0, d1, kmAtPx, zoomAround, panByPx });
  latest.current = { d0, d1, kmAtPx, zoomAround, panByPx };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { d0, d1, kmAtPx, zoomAround, panByPx } = latest.current;
      const px = e.clientX - svg.getBoundingClientRect().left;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setZoom(panByPx(-e.deltaX, [d0, d1]));
      else setZoom(zoomAround(kmAtPx(px, [d0, d1]), Math.exp(e.deltaY * 0.0015), [d0, d1]));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Pointer gestures: mouse drag pans, two-finger pinch zooms (and pans),
  // a single finger scrubs the crosshair.
  const pointers = useRef(new Map<number, number>());
  const gesture = useRef<
    { kind: "pan"; startX: number; dom: Domain } | { kind: "pinch"; dist: number; midKm: number; dom: Domain } | null
  >(null);
  const moved = useRef(false);

  const localX = (clientX: number) => clientX - (svgRef.current?.getBoundingClientRect().left ?? 0);
  const setHoverFromPx = (px: number) => setHoverX(px >= M.left && px <= M.left + iw ? px : null);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = { kind: "pinch", dist: Math.max(10, Math.abs(a - b)), midKm: kmAtPx((a + b) / 2), dom: [d0, d1] };
  };

  // ---------- scales ----------
  const visible = useMemo(() => pts.filter((p) => p[0] >= d0 && p[0] <= d1), [pts, d0, d1]);
  const { yMin, yMax, yTicks } = useMemo(() => {
    const src = visible.length > 1 ? visible : pts;
    if (!src.length) return { yMin: 0, yMax: 100, yTicks: [0, 50, 100] };
    let lo = Math.min(...src.map((p) => p[1]));
    let hi = Math.max(...src.map((p) => p[1]));
    // Keep flat canal days looking flat: never stretch less than 150 m.
    const minRange = zoom ? 40 : 150;
    if (hi - lo < minRange) {
      const mid = (hi + lo) / 2;
      lo = mid - minRange / 2;
      hi = mid + minRange / 2;
    }
    const step = niceStep(hi - lo, 3);
    const yMin = Math.max(0, Math.floor(lo / step) * step);
    const yMax = Math.ceil(hi / step) * step;
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-6; v += step) yTicks.push(v);
    return { yMin, yMax, yTicks };
  }, [visible, pts, zoom]);

  const x = (km: number) => M.left + ((km - d0) / (d1 - d0)) * iw;
  const y = (ele: number) => M.top + ih - ((ele - yMin) / (yMax - yMin)) * ih;

  // One line/area run per continuous stretch of riding.
  const runs = useMemo(() => {
    const out: ProfilePoint[][] = [];
    let cur: ProfilePoint[] = [];
    for (const p of profile) {
      if (p === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(p);
    }
    if (cur.length) out.push(cur);
    return out;
  }, [profile]);

  const linePath = (run: ProfilePoint[]) => run.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const areaPath = (run: ProfilePoint[]) => `${linePath(run)}L${x(run.at(-1)![0]).toFixed(1)},${M.top + ih}L${x(run[0][0]).toFixed(1)},${M.top + ih}Z`;
  const inView = (run: ProfilePoint[]) => run.at(-1)![0] >= d0 && run[0][0] <= d1;

  const xStep = niceStep(d1 - d0, Math.max(2, Math.floor(iw / 90)));
  const xTicks: number[] = [];
  for (let v = Math.ceil(d0 / xStep) * xStep; v <= d1 + 1e-6; v += xStep) xTicks.push(v);
  const fmtTick = (v: number) => (xStep < 1 ? v.toFixed(1) : String(Math.round(v)));

  // ---------- hover ----------
  const hoverKm = hoverX === null ? null : kmAtPx(hoverX);
  const hoverBand = hoverKm === null ? null : bands.find((b) => hoverKm >= b.from && hoverKm <= b.to) ?? null;
  const hoverPt = useMemo(() => {
    if (hoverKm === null || hoverBand || !pts.length) return null;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] < hoverKm) lo = mid;
      else hi = mid;
    }
    return Math.abs(pts[lo][0] - hoverKm) < Math.abs(pts[hi][0] - hoverKm) ? pts[lo] : pts[hi];
  }, [hoverKm, hoverBand, pts]);

  useEffect(() => {
    onHover(hoverPt ? [hoverPt[2], hoverPt[3]] : null);
  }, [hoverPt, onHover]);

  const eleAt = (km: number) => {
    const p = pts.reduce((best, q) => (Math.abs(q[0] - km) < Math.abs(best[0] - km) ? q : best), pts[0]);
    return p?.[1] ?? yMin;
  };

  const tipX = hoverPt ? x(hoverPt[0]) : hoverX;

  // Keep the hover label fully inside the chart: measure its real width
  // (it varies with the label text) and clamp, rather than guessing.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(0);
  useLayoutEffect(() => {
    const w = tipRef.current?.offsetWidth ?? 0;
    if (w !== tipW) setTipW(w);
  });
  const tipLeft = tipX === null ? 0 : Math.max(0, Math.min(size.w - tipW, tipX - tipW / 2));
  const tipLabel = hoverPt ? labelFor?.(hoverPt[0]) : null;
  // useId output can contain characters that break url(#…) references.
  const clipKey = `elev-${clipId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clip = `url(#${clipKey})`;

  return (
    <div className="elevation" ref={wrap}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="img"
        aria-label="Elevation profile — scroll or pinch to zoom"
        className={zoom ? "is-zoomed" : undefined}
        style={{ cursor: zoom ? "grab" : onPickKm ? "pointer" : undefined, touchAction: "none" }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, localX(e.clientX));
          moved.current = false;
          if (pointers.current.size === 2) {
            startPinch();
            setHoverX(null);
          } else if (e.pointerType === "mouse" && zoom) {
            e.currentTarget.setPointerCapture(e.pointerId);
            gesture.current = { kind: "pan", startX: localX(e.clientX), dom: [d0, d1] };
          } else if (e.pointerType !== "mouse") {
            setHoverFromPx(localX(e.clientX));
          }
        }}
        onPointerMove={(e) => {
          const px = localX(e.clientX);
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, px);
          const g = gesture.current;
          if (g?.kind === "pinch" && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const span = ((g.dom[1] - g.dom[0]) * g.dist) / Math.max(10, Math.abs(a - b));
            // Keep the km that started under the fingers' midpoint under it.
            const start = g.midKm - (((a + b) / 2 - M.left) / iw) * span;
            setZoom(clampDomain(start, start + span));
            moved.current = true;
          } else if (g?.kind === "pan") {
            if (Math.abs(px - g.startX) > 3) {
              moved.current = true;
              setZoom(panByPx(px - g.startX, g.dom));
              setHoverX(null);
            }
          } else {
            setHoverFromPx(px);
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (gesture.current?.kind === "pinch" && pointers.current.size === 1) {
            // Lifting one finger: carry on scrubbing with the other.
            gesture.current = null;
          } else if (pointers.current.size === 0) {
            gesture.current = null;
          }
          if (e.pointerType !== "mouse" && pointers.current.size === 0) setHoverX(null);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && gesture.current?.kind !== "pan") setHoverX(null);
        }}
        onDoubleClick={() => setZoom(null)}
        onClick={(e) => {
          const px = localX(e.clientX);
          if (!moved.current && px >= M.left && px <= M.left + iw) onPickKm?.(kmAtPx(px));
        }}
      >
        <defs>
          <pattern id={`hatch-${clipKey}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" strokeWidth="2" />
          </pattern>
          <clipPath id={clipKey}>
            <rect x={M.left} y={M.top} width={iw} height={ih} />
          </clipPath>
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} className="grid" />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="axis">
              {fmtInt(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v, i) => (
          <text key={v} x={x(v)} y={M.top + ih + 16} textAnchor="middle" className="axis">
            {fmtTick(v)}
            {i === 0 ? " km" : ""}
          </text>
        ))}

        <g clipPath={clip}>
          {bands.map((b) => (
            <g key={`${b.name}-${b.from}`}>
              <rect x={x(b.from)} y={M.top} width={Math.max(1, x(b.to) - x(b.from))} height={ih} fill={`url(#hatch-${clipKey})`} className={`band band-${b.kind}`} />
              {x(b.to) - x(b.from) > 70 && (
                <text x={(Math.max(x(b.from), M.left) + Math.min(x(b.to), M.left + iw)) / 2} y={M.top + 12} textAnchor="middle" className="band-label">
                  {b.kind === "train" ? "Train" : "Ferry"}
                </text>
              )}
            </g>
          ))}

          {dividers.map((d) => (
            <line key={d.km} x1={x(d.km)} x2={x(d.km)} y1={M.top} y2={M.top + ih} className="divider" />
          ))}

          {runs.filter(inView).map((run) => (
            <g key={run[0][0]}>
              <path d={areaPath(run)} className="area" />
              <path d={linePath(run)} className="line" />
            </g>
          ))}

          {photos
            .filter((p) => p.km !== null && p.km >= d0 && p.km <= d1)
            .map((p) => (
              <circle
                key={p.id}
                cx={x(p.km!)}
                cy={y(eleAt(p.km!))}
                r={4.5}
                className="photo-dot"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!moved.current) onOpenPhoto?.(p);
                }}
              >
                <title>{`${p.caption || "Photo"} · km ${fmtKm(p.km!)}`}</title>
              </circle>
            ))}

          {tipX !== null && hoverKm !== null && (
            <g pointerEvents="none">
              <line x1={tipX} x2={tipX} y1={M.top} y2={M.top + ih} className="crosshair" />
              {hoverPt && <circle cx={x(hoverPt[0])} cy={y(hoverPt[1])} r={4.5} className="crosshair-dot" />}
            </g>
          )}
        </g>
      </svg>

      {zoom && (
        <button className="chart-reset" onClick={() => setZoom(null)}>
          Reset zoom
        </button>
      )}

      {tipX !== null && hoverKm !== null && (
        <div className="chart-tip" ref={tipRef} style={{ left: tipLeft }}>
          {hoverBand ? (
            <>
              <strong>{hoverBand.kind === "train" ? "🚆" : "⛴"} {hoverBand.name}</strong>
              <span>{fmtKm(hoverBand.to - hoverBand.from)} km</span>
            </>
          ) : hoverPt ? (
            <>
              {tipLabel && <span className="tip-day">{tipLabel}</span>}
              <strong>{Math.round(hoverPt[1])} m</strong>
              <span>km {fmtKm(hoverPt[0])}</span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
