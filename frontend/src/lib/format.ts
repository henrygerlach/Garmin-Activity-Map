export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// For the activity list, where a full "Aug 20, 2026, 2:01 AM" is wide enough
// to push the last two columns out of the sidebar. The year is dropped when
// it's the current one — in a log that's read newest-first it's noise on
// nearly every row, and it comes back automatically for older entries.
export function formatDateCompact(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = date.toLocaleDateString(
    undefined,
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" },
  );
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

// Whole-km, thousands-comma'd — for hero/stat-tile numbers where 2dp precision
// reads as noise rather than signal.
export function formatDistanceCompact(meters: number): string {
  return `${Math.round(meters / 1000).toLocaleString()} km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Whole hours only — for stat tiles, where minute-level precision on a large
// total isn't the point.
export function formatDurationCompact(seconds: number): string {
  return `${Math.round(seconds / 3600).toLocaleString()} h`;
}

export function formatSpeed(metersPerSecond: number | null): string {
  if (metersPerSecond === null) return "—";
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

// distance / elapsed time (Garmin's `averageSpeed`) counts time stopped at
// traffic lights etc. as part of the average, dragging it down — distance /
// moving_duration_s ("in Bewegung") excludes stopped time and reflects actual
// pace while moving, which is what's meaningful for a walk or ride.
export function movingSpeedMps(activity: { distance_m: number; moving_duration_s: number }): number | null {
  if (activity.moving_duration_s <= 0) return null;
  return activity.distance_m / activity.moving_duration_s;
}

export function formatHr(bpm: number | null): string {
  if (bpm === null) return "—";
  return `${Math.round(bpm)} bpm`;
}

export function formatRelativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 30) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Bare figures for the activity list, where the unit is carried once in the
// column header instead of being repeated on every row. Down a column of
// forty entries, "km" forty times is noise, not information.
export function formatKmValue(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function formatKmhValue(metersPerSecond: number | null): string {
  if (metersPerSecond === null) return "—";
  return (metersPerSecond * 3.6).toFixed(1);
}

export function formatBpmValue(bpm: number | null): string {
  if (bpm === null) return "—";
  return String(Math.round(bpm));
}
