import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Tooltip, useMap } from "react-leaflet";
import type { Activity, ActivityKind } from "../types";
import { formatDate, formatDistance, formatSpeed, formatHr, movingSpeedMps } from "../lib/format";
import { ACTIVITY_COLORS, ACTIVITY_HIGHLIGHT_COLORS, FREQUENCY_GRADIENT_CSS } from "../lib/colors";
import { DATE_RANGE_OPTIONS, DATE_RANGE_LABELS, filterByDateRange, type DateRangeOption } from "../lib/dateRange";
import { createVisitIndex, nearestPointOnTrack, type VisitIndex } from "../lib/visitCounts";
import { FrequencyLayer } from "./FrequencyLayer";
import { TimelapseBar, type TimelapseSpeed } from "./TimelapseBar";

// How long each day of history is held during playback at 1× speed, which puts
// a year of logging past in about twenty seconds. The speed control divides
// this, so 0.5× holds each day twice as long.
const TIMELAPSE_BASE_MS_PER_DAY = 60;

// Half speed to start: at full speed a year goes by fast enough that a walk in
// a new place can be missed between glances, and slowing down is the first
// thing you want to do rather than something to go looking for.
const DEFAULT_TIMELAPSE_SPEED: TimelapseSpeed = 0.5;

// How far apart two tracks can be and still count as the same place. Set well
// above the span of a city's walking routes and well below the distance to the
// next city, so a day's walk pulls its whole home city into frame without ever
// dragging another one in with it.
const CLUSTER_RADIUS_KM = 25;
const METERS_PER_DEG_LAT = 111_320;

// Cluster membership is transitive — a track close to a track close to the
// anchor belongs too — which converges in a couple of passes for real data.
// The cap only guards against a pathological chain of tracks.
const MAX_CLUSTER_PASSES = 6;

const CAMERA_FLIGHT_S = 0.6;

// A beat of stillness after the camera lands, before the reveal picks up again.
// Arriving somewhere new and immediately having tracks appear gives no moment
// to register where "here" is — the eye is still catching up with the move
// while the next day is already being drawn. Held rather than merely slowed,
// because the problem is the overlap, not the pace.
const CAMERA_HOLD_MS = 900;

// The camera is aimed at substantially more than the cluster it's framing, so
// the cluster has to grow by more than half again before it needs re-aiming.
// Without that headroom it moves almost every day — in the early history a new
// walk pushes the cluster out most days — and since each move costs a pause,
// the reveal crawls as well as twitches. Generous is the right setting: the
// frame is meant to show a whole city, so extra margin costs nothing, while too
// little is the difference between a smooth run and a slideshow.
//
// It has to be generous in the *tight* dimension to work at all. A frame is
// fitted to the map's aspect ratio, so one axis ends up with slack to spare and
// the other with none — and the one with none is where the next day's growth
// escapes.
const FRAME_SLACK = 0.6;
// Floor for a cluster too small for a fraction of its span to mean anything —
// the history opens on a single walk barely a hundred metres across, where 60%
// of nothing is still nothing. Roughly 90 m, which frames that walk and the
// block around it rather than the district it sits in. Kept deliberately tight:
// the opening days are the ones worth seeing close up, and the proportional
// headroom takes back over as soon as the routes spread at all, so the cost is
// only a few extra camera moves in the first week.
const MIN_FRAME_SLACK_DEG = 0.0008;

// The camera also re-aims when the frame has become this much wider than what
// it's meant to be showing, not only when something falls outside it. Growing
// is not the only direction the view moves in: scrubbing backwards, or
// narrowing a filter, leaves a frame sized for far more than is now drawn, and
// without this the content just sits in the middle of it as a speck — the map
// having no reason to move because everything is technically still on screen.
// Comfortably above the headroom above, so an ordinary day's growth can never
// trip it and set the camera oscillating.
const REFRAME_SHRINK_RATIO = 2.2;

/**
 * One entry per calendar day spanned by the given activities, oldest first —
 * the positions the time-lapse scrubber steps through. Days with nothing
 * logged are included, so the animation keeps a steady pace through quiet
 * stretches instead of skipping over them.
 */
function buildTimelapseDays(activities: Activity[]): Date[] {
  if (activities.length === 0) return [];

  const times = activities.map((a) => new Date(a.start_time).getTime());
  const cursor = new Date(Math.min(...times));
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(Math.max(...times));
  last.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Where `time` falls in a day list, clamped to its ends.
 *
 * The cursor is carried as a date rather than a position in this list, because
 * the list is rebuilt whenever a filter changes: position 40 means a different
 * day once the range starts somewhere else, so keeping the position is what
 * makes changing a filter jump to an unrelated date. Keeping the date and
 * looking the position up again holds the view still instead.
 */
function dayIndexFor(days: Date[], time: number | null): number {
  if (days.length === 0) return 0;
  if (time === null) return 0;
  const offset = Math.round((time - days[0].getTime()) / 86_400_000);
  return Math.min(Math.max(offset, 0), days.length - 1);
}

function FitBounds({ activities }: { activities: Activity[] }) {
  const map = useMap();

  useEffect(() => {
    const allPoints = activities.flatMap((activity) => activity.points);
    if (allPoints.length === 0) return;
    map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24] });
    // Only refit when the visible set of activities changes, not on every hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, map]);

  return null;
}

/** minLat, minLng, maxLat, maxLng. */
type BBox = [number, number, number, number];

function boundsOf(bbox: BBox): L.LatLngBounds {
  return L.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
}

function unionBBox(a: BBox, b: BBox): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function padBBox(b: BBox, lat: number, lng: number): BBox {
  return [b[0] - lat, b[1] - lng, b[2] + lat, b[3] + lng];
}

function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

function bboxOverlaps(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Points the camera at the part of the map the time-lapse is currently drawing
 * in, and holds it still the rest of the time.
 *
 * It re-aims in both directions: when what's being drawn no longer fits the
 * frame, and when the frame has grown far wider than what's being drawn. The
 * second case is what makes going backwards work — scrubbing back, or narrowing
 * a filter, shrinks the subject while the frame stays where it was, and with
 * only the first rule the camera would sit still because everything is
 * technically on screen, just far too small to see.
 *
 * While it is moving it reports itself busy, so the reveal pauses rather than
 * drawing tracks the viewer can't follow across a panning map.
 *
 * A null `bbox` means the day added nothing worth looking at, and the camera
 * stays exactly where it is.
 */
function FollowRevealedBounds({
  bbox,
  onCameraBusyChange,
}: {
  bbox: BBox | null;
  onCameraBusyChange: (busy: boolean) => void;
}) {
  const map = useMap();
  // The viewport the map actually settled on after its last move. Only the
  // settle callback writes it — deliberately not the effect body, so that
  // re-running the effect with the same inputs simply repeats the same move
  // instead of taking a different branch the second time. An effect whose guard
  // reads state the effect itself has already mutated silently does nothing on
  // a re-run, which strands the reveal paused.
  const framed = useRef<BBox | null>(null);

  useEffect(() => {
    // Every way out of this effect has to leave the flag false unless it has
    // just started a flight and armed the settle timer that clears it. The flag
    // is what pauses the reveal, so a path that returns without releasing it
    // leaves playback unable to tick — and since the play button still toggles,
    // it reads as a dead button rather than as a camera that never landed.
    if (!bbox) {
      onCameraBusyChange(false);
      return;
    }

    const latSlack = Math.max((bbox[2] - bbox[0]) * FRAME_SLACK, MIN_FRAME_SLACK_DEG);
    const lngSlack = Math.max((bbox[3] - bbox[1]) * FRAME_SLACK, MIN_FRAME_SLACK_DEG);
    const target = padBBox(bbox, latSlack, lngSlack);

    if (framed.current) {
      const tooWide =
        Math.max(
          (framed.current[2] - framed.current[0]) / (target[2] - target[0]),
          (framed.current[3] - framed.current[1]) / (target[3] - target[1]),
        ) > REFRAME_SHRINK_RATIO;
      if (bboxContains(framed.current, bbox) && !tooWide) {
        onCameraBusyChange(false);
        return;
      }
    }

    onCameraBusyChange(true);
    map.flyToBounds(boundsOf(target), {
      padding: [20, 20],
      // Only binds when the cluster is small enough that fitting it would zoom
      // past street level — which in practice means the opening days, before
      // there are enough routes to fill a frame. Set close in, so those first
      // few tracks are the picture rather than a mark on a district map.
      maxZoom: 17,
      duration: CAMERA_FLIGHT_S,
    });

    // Records where the camera was *sent*, not where the map reports being.
    // Asking the map is the tempting version and it does not work: read on a
    // timer it answers mid-flight, and read on `moveend` it can answer for a
    // move that was already in progress when this one started. Either way the
    // frame comes back far wider than where the camera actually ended up, and a
    // frame that wide contains everything — so no later day ever looks
    // off-screen and the camera never moves again.
    //
    // The target is exact and knowable up front. It can understate the view
    // when the zoom cap or the map's aspect ratio leave extra on screen, which
    // costs at worst an occasional unnecessary move — the safe direction to err.
    const timer = window.setTimeout(() => {
      framed.current = target;
      onCameraBusyChange(false);
    }, CAMERA_FLIGHT_S * 1000 + CAMERA_HOLD_MS);

    return () => {
      window.clearTimeout(timer);
      // Scrubbing, changing a filter, or switching the time-lapse off during
      // the second and a half a flight takes re-runs this effect and cancels
      // the settle above, so the release has to happen here too. The next run
      // re-arms it in the same commit if it starts another flight.
      onCameraBusyChange(false);
    };
  }, [bbox, map, onCameraBusyChange]);

  return null;
}

function FlyToSelected({ activities, selectedId }: { activities: Activity[]; selectedId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const activity = activities.find((a) => a.id === selectedId);
    if (!activity || activity.points.length === 0) return;
    map.flyToBounds(L.latLngBounds(activity.points), { padding: [64, 64], maxZoom: 16 });
  }, [selectedId, activities, map]);

  return null;
}

interface ActivityPolylineProps {
  activity: Activity;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  visitIndex: VisitIndex;
}

function ActivityPolyline({ activity, isHighlighted, onHover, visitIndex }: ActivityPolylineProps) {
  const layerRef = useRef<L.Polyline>(null);
  // How many activities pass the point of this track under the cursor. Kept here rather
  // than in the parent so tracking the pointer only re-renders this one line —
  // and React bails out of the render entirely while the count is unchanged.
  const [visitsHere, setVisitsHere] = useState<number | null>(null);

  const countVisitsAt = (latlng: L.LatLng) => {
    const onTrack = nearestPointOnTrack(activity.points, latlng.lat, latlng.lng);
    return onTrack ? visitIndex.countAt(onTrack[0], onTrack[1]) : 0;
  };

  // Reordering JSX children doesn't reorder Leaflet's own SVG layer stack —
  // Leaflet manages that internally — so bring the layer forward explicitly
  // whenever it becomes the highlighted one.
  useEffect(() => {
    if (isHighlighted) {
      layerRef.current?.bringToFront();
    }
  }, [isHighlighted]);

  return (
    <Polyline
      ref={layerRef}
      positions={activity.points}
      pathOptions={{
        color: isHighlighted ? ACTIVITY_HIGHLIGHT_COLORS[activity.type] : ACTIVITY_COLORS[activity.type],
        weight: isHighlighted ? 6 : 4,
        opacity: isHighlighted ? 1 : 0.7,
      }}
      eventHandlers={{
        mouseover: (e) => {
          onHover(activity.id);
          setVisitsHere(countVisitsAt(e.latlng));
        },
        mousemove: (e) => setVisitsHere(countVisitsAt(e.latlng)),
        mouseout: () => {
          onHover(null);
          setVisitsHere(null);
        },
      }}
    >
      <Tooltip sticky>
        <strong>{activity.name}</strong>
        <br />
        {formatDate(activity.start_time)}
        <br />
        {formatDistance(activity.distance_m)} · {formatSpeed(movingSpeedMps(activity))}
        <br />
        Avg HR: {formatHr(activity.avg_hr)}
        {visitsHere !== null && (
          <>
            <br />
            <span className="map-tooltip__visits">
              {visitsHere === 1 ? "Been here once" : `Been here ${visitsHere} times`}
            </span>
          </>
        )}
      </Tooltip>
    </Polyline>
  );
}

type TypeFilter = "all" | ActivityKind;

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "walk", label: "Walk" },
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
];

interface MapViewProps {
  activities: Activity[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  selectedId: string | null;
}

export function MapView({ activities, hoveredId, onHover, selectedId }: MapViewProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");
  const [frequencyMap, setFrequencyMap] = useState(false);
  const [frequencyMaxCount, setFrequencyMaxCount] = useState(1);
  const [timelapse, setTimelapse] = useState(false);
  // The day being shown, as a timestamp. See `dayIndexFor` for why this isn't
  // a position in the day list. Null means "the first day of whatever is
  // currently visible".
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [speed, setSpeed] = useState<TimelapseSpeed>(DEFAULT_TIMELAPSE_SPEED);

  const withGps = useMemo(() => activities.filter((a) => a.points.length > 1), [activities]);

  const filtered = useMemo(() => {
    const byType = typeFilter === "all" ? withGps : withGps.filter((a) => a.type === typeFilter);
    return filterByDateRange(byType, dateRange);
  }, [withGps, typeFilter, dateRange]);

  // The time-lapse runs over whatever the filters leave visible, so narrowing
  // to bike rides or the last 90 days scrubs through just that stretch.
  const timelapseDays = useMemo(() => buildTimelapseDays(filtered), [filtered]);

  // Resolved fresh against the current day list, so narrowing a filter to a
  // range that ends before the cursor simply parks it on the last day rather
  // than running off the end.
  const dayIndex = dayIndexFor(timelapseDays, cursorTime);

  // Everything logged up to the end of the cursor's day.
  const revealed = useMemo(() => {
    if (!timelapse || timelapseDays.length === 0) return filtered;
    const cutoff = new Date(timelapseDays[dayIndex]);
    cutoff.setHours(23, 59, 59, 999);
    return filtered.filter((a) => new Date(a.start_time) <= cutoff);
  }, [filtered, timelapse, timelapseDays, dayIndex]);

  // Held while the camera is flying to a new place and for a beat after it
  // lands, so the reveal neither draws tracks across a moving map nor restarts
  // the instant it stops. Resumes by itself once that window is over.
  useEffect(() => {
    if (!playing || cameraBusy) return;
    const timer = setInterval(() => {
      // Purely a function of the day list — no stopping decided in here.
      // Updaters run twice under React's development double-invoke, so a state
      // change made from inside one happens twice too.
      setCursorTime((current) =>
        timelapseDays[Math.min(dayIndexFor(timelapseDays, current) + 1, timelapseDays.length - 1)].getTime(),
      );
    }, TIMELAPSE_BASE_MS_PER_DAY / speed);
    return () => clearInterval(timer);
  }, [playing, cameraBusy, speed, timelapseDays]);

  // Stopping is its own concern, watching where the cursor ended up rather than
  // being decided inside the tick. That also covers a filter change that leaves
  // the cursor on the last day of a shorter range.
  useEffect(() => {
    if (playing && timelapseDays.length > 0 && dayIndex >= timelapseDays.length - 1) setPlaying(false);
  }, [playing, dayIndex, timelapseDays.length]);

  const toggleTimelapse = (enabled: boolean) => {
    setTimelapse(enabled);
    // Enabling rewinds to the start but waits to be played. Starting on its own
    // would take the map away from whatever the user was looking at the moment
    // they ticked the box; this way the first frame sits there until they ask
    // for it, and they can scrub straight to a date instead.
    setCursorTime(null);
    setPlaying(false);
    // The camera releases this itself when it unmounts; resetting it here too
    // keeps every piece of time-lapse state set from one place.
    setCameraBusy(false);
  };

  const togglePlay = () => {
    // Pressing play once the run has finished starts it over rather than
    // sitting on the last frame doing nothing.
    if (!playing && dayIndex >= timelapseDays.length - 1) setCursorTime(null);
    setPlaying((p) => !p);
  };

  // An explicit click on a table row should always be able to navigate to
  // and highlight that activity, even if the date range would otherwise hide
  // it — the user's direct action overrides that part of the toolbar. The
  // type filter still wins, though: switching it away from the selected
  // activity's type should hide that activity like any other.
  const displayed = useMemo(() => {
    // While the time-lapse is on, the cursor date is the whole premise — an
    // activity from after it must not be forced back on to the map.
    if (timelapse) return revealed;
    if (!selectedId || revealed.some((a) => a.id === selectedId)) return revealed;
    const selected = withGps.find((a) => a.id === selectedId);
    if (!selected || (typeFilter !== "all" && selected.type !== typeFilter)) return revealed;
    return [...revealed, selected];
  }, [revealed, selectedId, withGps, typeFilter, timelapse]);

  const revealedDistanceM = useMemo(
    () => displayed.reduce((sum, a) => sum + a.distance_m, 0),
    [displayed],
  );

  // Each activity's own extent, computed once per filtered set. The time-lapse
  // needs the extent of everything revealed on every frame, and unioning ~600
  // precomputed boxes is trivial where re-walking their ~170k points would not
  // be.
  const bboxById = useMemo(() => {
    const boxes = new Map<string, BBox>();
    for (const activity of filtered) {
      let minLat = Infinity;
      let minLng = Infinity;
      let maxLat = -Infinity;
      let maxLng = -Infinity;
      for (const [lat, lng] of activity.points) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      if (minLat !== Infinity) boxes.set(activity.id, [minLat, minLng, maxLat, maxLng]);
    }
    return boxes;
  }, [filtered]);

  /**
   * What the camera should be looking at: the tracks drawn on the cursor's day,
   * widened to take in everything already drawn in the same place.
   *
   * Framing the whole revealed history instead would make the picture useless
   * as soon as a second city appears — a walk in Hamburg becomes a few pixels
   * because Berlin has to fit on screen too. Anchoring on the day's own tracks
   * and growing out to their cluster keeps the scale at "one city" no matter
   * how far apart the cities are, while still showing all of a city once it has
   * filled in rather than only the single new walk.
   *
   * Null on a day that logged nothing, which leaves the camera alone.
   */
  const focusBBox = useMemo<BBox | null>(() => {
    if (!timelapse || timelapseDays.length === 0) return null;

    const dayStart = timelapseDays[dayIndex].getTime();
    const dayEnd = dayStart + 86_400_000;

    // The day's *last* track, rather than all of them combined. On a day spent
    // travelling — a walk at home in the morning, another in a city 250 km away
    // that evening — combining them frames both cities at once, which shrinks
    // the day's actual walking to a few pixels and, worse, leaves a frame so
    // wide that every later day looks like it's already on screen and the
    // camera never moves again.
    let frame: BBox | null = null;
    let latest = -Infinity;
    for (const activity of displayed) {
      const time = new Date(activity.start_time).getTime();
      if (time < dayStart || time >= dayEnd || time <= latest) continue;
      const box = bboxById.get(activity.id);
      if (!box) continue;
      latest = time;
      frame = box;
    }
    if (frame === null) return null;

    const latPad = (CLUSTER_RADIUS_KM * 1000) / METERS_PER_DEG_LAT;
    // Longitude degrees shrink towards the poles; one reference latitude keeps
    // the radius roughly circular without trigonometry per comparison.
    const lngPad = latPad / Math.max(Math.cos((frame[0] * Math.PI) / 180), 0.01);

    for (let pass = 0; pass < MAX_CLUSTER_PASSES; pass++) {
      const reach = padBBox(frame, latPad, lngPad);
      let grew = false;
      for (const activity of displayed) {
        const box = bboxById.get(activity.id);
        if (!box || bboxContains(frame, box) || !bboxOverlaps(reach, box)) continue;
        frame = unionBBox(frame, box);
        grew = true;
      }
      if (!grew) break;
    }

    return frame;
  }, [displayed, bboxById, timelapse, timelapseDays, dayIndex]);

  // Built lazily on the first hover, and thrown away whenever the visible set
  // changes so the count always reflects what's actually on the map.
  const visitIndex = useMemo(() => createVisitIndex(displayed), [displayed]);

  return (
    <div className="map-page">
      <div className="map-toolbar">
        <div className="segmented" role="group" aria-label="Activity type">
          {TYPE_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={typeFilter === value}
              className={typeFilter === value ? "segmented__option segmented__option--active" : "segmented__option"}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Date range">
          {DATE_RANGE_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={dateRange === value}
              className={dateRange === value ? "segmented__option segmented__option--active" : "segmented__option"}
              onClick={() => setDateRange(value)}
            >
              {DATE_RANGE_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="map-toolbar__toggle">
          <input type="checkbox" checked={frequencyMap} onChange={(e) => setFrequencyMap(e.target.checked)} />
          Frequency map
        </label>
        <label className="map-toolbar__toggle map-toolbar__toggle--tight">
          <input type="checkbox" checked={timelapse} onChange={(e) => toggleTimelapse(e.target.checked)} />
          Time-lapse
        </label>
      </div>
      {timelapse && timelapseDays.length > 0 && (
        <TimelapseBar
          days={timelapseDays}
          dayIndex={dayIndex}
          onScrub={(index) => {
            setPlaying(false);
            setCursorTime(timelapseDays[index].getTime());
          }}
          playing={playing}
          onTogglePlay={togglePlay}
          speed={speed}
          onSpeedChange={setSpeed}
          revealedCount={displayed.length}
          revealedDistanceM={revealedDistanceM}
        />
      )}
      <div className="map-canvas">
        <MapContainer center={[51.1657, 10.4515]} zoom={6} style={{ height: "100%", width: "100%" }}>
          {/* Carto's Voyager basemap rather than standard OSM tiles: it keeps
              paths, parks and water legible but at a fraction of the
              saturation, so the vermilion and teal traces are the brightest
              thing on the map instead of competing with the roads. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          {/* A time-lapse frames what's been drawn so far and grows with it;
              otherwise the map fits the whole visible set once. */}
          {timelapse ? (
            <FollowRevealedBounds bbox={focusBBox} onCameraBusyChange={setCameraBusy} />
          ) : (
            <>
              <FitBounds activities={displayed} />
              {/* Suspended during a time-lapse: the set of drawn activities
                  changes on every frame, so this would re-fly to the selected
                  row continuously and fight the reveal for control of the map. */}
              <FlyToSelected activities={displayed} selectedId={selectedId} />
            </>
          )}
          {frequencyMap ? (
            <FrequencyLayer activities={displayed} onMaxCountChange={setFrequencyMaxCount} />
          ) : (
            displayed.map((activity) => (
              <ActivityPolyline
                key={activity.id}
                activity={activity}
                isHighlighted={activity.id === hoveredId || activity.id === selectedId}
                onHover={onHover}
                visitIndex={visitIndex}
              />
            ))
          )}
        </MapContainer>
        {frequencyMap && (
          <div className="map-legend">
            <span>1×</span>
            <span className="map-legend__bar" style={{ background: FREQUENCY_GRADIENT_CSS }} />
            <span>{frequencyMaxCount}×</span>
          </div>
        )}
      </div>
    </div>
  );
}
