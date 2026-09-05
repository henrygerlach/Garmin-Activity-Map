export type ActivityKind = "walk" | "bike";

export interface Activity {
  id: string;
  garmin_activity_id: number;
  name: string;
  type: ActivityKind;
  start_time: string;
  /** Wall-clock time where the activity happened, with no zone attached. */
  start_time_local: string | null;
  timezone_id: string | null;
  location_name: string | null;
  distance_m: number;
  duration_s: number;
  moving_duration_s: number;
  elapsed_duration_s: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  min_elevation_m: number | null;
  max_elevation_m: number | null;
  calories: number | null;
  steps: number | null;
  avg_cadence_spm: number | null;
  max_cadence_spm: number | null;
  avg_stride_length_cm: number | null;
  moderate_intensity_min: number | null;
  vigorous_intensity_min: number | null;
  /** Seconds spent in heart-rate zones 1..5, in order. */
  hr_time_in_zone_s: number[] | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  points: [number, number][];
}

/**
 * Per-point sensor streams for one activity, as parallel arrays index-aligned
 * with that activity's `points`. Entries are null where the sensor reported
 * nothing for that sample.
 *
 * Lives in its own table, and is fetched separately from the activity list:
 * it's an order of magnitude more data than everything else combined, and only
 * the statistics tab reads it.
 */
export interface ActivityStreams {
  garmin_activity_id: number;
  t_s: number[];
  distance_m: number[];
  speed_mps: number[];
  hr_bpm: (number | null)[];
  elevation_m: (number | null)[];
  cadence_spm: (number | null)[];
}

/**
 * The subset of stream columns the pace/heart-rate charts actually download.
 * `t_s` is pulled along with the pace and heart-rate series only so the first
 * few minutes of each activity can be discarded — heart rate lags pace at the
 * start, and those samples would otherwise pull every band down.
 */
export type PaceHrStream = Pick<ActivityStreams, "garmin_activity_id" | "t_s" | "speed_mps" | "hr_bpm">;
