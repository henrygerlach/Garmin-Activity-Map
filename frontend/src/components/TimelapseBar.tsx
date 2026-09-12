/**
 * Playback rates, as a multiplier on the base day-per-tick pace. Offered as a
 * few fixed steps rather than a continuous control: the useful range is narrow,
 * and picking "half speed" is easier than dragging for it.
 */
const TIMELAPSE_SPEEDS = [0.25, 0.5, 1, 2] as const;

export type TimelapseSpeed = (typeof TIMELAPSE_SPEEDS)[number];

interface TimelapseBarProps {
  days: Date[];
  dayIndex: number;
  onScrub: (dayIndex: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: TimelapseSpeed;
  onSpeedChange: (speed: TimelapseSpeed) => void;
  revealedCount: number;
  revealedDistanceM: number;
}

/**
 * Transport controls for the map's time-lapse: a play/pause button, a speed
 * selector, a scrubber over every day of the visible history, and a readout of
 * how much of it has been drawn so far.
 *
 * Presentational only — the day cursor and playback timer live in `MapView`,
 * which needs them to decide what to draw.
 */
export function TimelapseBar({
  days,
  dayIndex,
  onScrub,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  revealedCount,
  revealedDistanceM,
}: TimelapseBarProps) {
  const cursor = days[dayIndex];
  if (!cursor) return null;

  return (
    <div className="timelapse">
      <button
        type="button"
        className="timelapse__play"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause time-lapse" : "Play time-lapse"}
      >
        {/* Inline glyphs rather than text, so the button keeps one width as it
            toggles and the controls beside it never shift. */}
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          {playing ? (
            <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
          ) : (
            <path d="M3 1.5 10.5 6 3 10.5z" fill="currentColor" />
          )}
        </svg>
      </button>

      {/* radiogroup rather than group+aria-pressed: one speed is in effect at
          a time, which is what radio semantics describe. */}
      <div className="segmented" role="radiogroup" aria-label="Playback speed">
        {TIMELAPSE_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={speed === option}
            className={speed === option ? "segmented__option segmented__option--active" : "segmented__option"}
            onClick={() => onSpeedChange(option)}
          >
            {/* "0.25×" rather than "¼×": the fractions render small enough to
                be a guess at this size, and the decimals line up as a scale. */}
            {option}×
          </button>
        ))}
      </div>

      <input
        type="range"
        className="timelapse__scrubber"
        min={0}
        max={days.length - 1}
        value={dayIndex}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Time-lapse date"
        aria-valuetext={cursor.toLocaleDateString(undefined, { dateStyle: "long" })}
      />

      <div className="timelapse__readout">
        <span className="timelapse__date">
          {cursor.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span className="timelapse__totals">
          {revealedCount.toLocaleString()} · {Math.round(revealedDistanceM / 1000).toLocaleString()} km
        </span>
      </div>
    </div>
  );
}
