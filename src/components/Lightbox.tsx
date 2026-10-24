"use client";

import YARL from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { useMemo, type CSSProperties } from "react";
import type { Photo } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/format";

type Props = {
  photos: Photo[];
  /** Photo to show; null when closed. */
  index: number | null;
  dayLabel?: (p: Photo) => string;
  onIndex: (i: number) => void;
  onClose: () => void;
};

/**
 * Full-screen gallery over every photo in trip order (yet-another-react-
 * lightbox): swipe on touch, arrow keys / Esc on desktop, pinch or
 * double-click to zoom. While a photo loads, its tiny inline version sits
 * blurred behind it.
 */
export default function Lightbox({ photos, index, dayLabel, onIndex, onClose }: Props) {
  const slides = useMemo(
    () =>
      photos.map((p, i) => ({
        src: p.src,
        width: p.width,
        height: p.height,
        alt: p.caption,
        title: p.caption,
        description: `${dayLabel?.(p) ? `${dayLabel(p)} · ` : ""}${fmtDate(p.date, { weekday: "short", day: "numeric", month: "short" })} · ${fmtTime(p.takenAt)} · ${i + 1} of ${photos.length}`,
        blur: p.blur,
      })),
    [photos, dayLabel]
  );

  return (
    <YARL
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      slides={slides}
      plugins={[Captions, Zoom]}
      on={{ view: ({ index }) => onIndex(index) }}
      carousel={{ finite: true, preload: 2, padding: 0 }}
      controller={{ closeOnPullDown: true, closeOnBackdropClick: true }}
      captions={{ descriptionTextAlign: "center", descriptionMaxLines: 2 }}
      styles={{ container: { backgroundColor: "#0c0a08" } }}
      render={{
        slideContainer: ({ slide, children }) => {
          const s = slide as (typeof slides)[number];
          return (
            <div className="lb-slide">
              {s.blur && <div className="lb-blur" style={{ backgroundImage: `url(${s.blur})`, "--ar": s.width / s.height } as CSSProperties} />}
              {children}
            </div>
          );
        },
      }}
    />
  );
}
