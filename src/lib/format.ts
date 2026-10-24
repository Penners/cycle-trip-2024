export const fmtKm = (km: number) => (km >= 100 ? Math.round(km).toString() : km.toFixed(1));

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

// The phone logged UK time throughout, so times are shown in UK time.
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export const fmtInt = (n: number) => n.toLocaleString("en-GB");
