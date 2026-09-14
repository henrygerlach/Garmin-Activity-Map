import type { Activity, DailyMetric } from "../types";

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "1",
    garmin_activity_id: 1,
    name: "Morning walk",
    type: "walk",
    start_time: "2026-01-05T08:00:00.000Z",
    start_time_local: "2026-01-05T09:00:00",
    timezone_id: "1",
    location_name: null,
    distance_m: 5000,
    duration_s: 3600,
    moving_duration_s: 3000,
    elapsed_duration_s: 3600,
    avg_speed_mps: 1.4,
    max_speed_mps: 2,
    avg_hr: 110,
    max_hr: 140,
    elevation_gain_m: 20,
    elevation_loss_m: 20,
    min_elevation_m: 0,
    max_elevation_m: 30,
    calories: 300,
    steps: 6000,
    avg_cadence_spm: 100,
    max_cadence_spm: 120,
    avg_stride_length_cm: 80,
    moderate_intensity_min: 30,
    vigorous_intensity_min: 0,
    hr_time_in_zone_s: [100, 200, 300, 0, 0],
    wahoo_workout_id: null,
    avg_power_w: null,
    norm_power_w: null,
    tss: null,
    work_kj: null,
    avg_cadence_rpm: null,
    start_lat: 52.5,
    start_lng: 13.4,
    end_lat: 52.51,
    end_lng: 13.41,
    points: [
      [52.5, 13.4],
      [52.501, 13.401],
    ],
    ...overrides,
  };
}

export function makeDailyMetric(overrides: Partial<DailyMetric> = {}): DailyMetric {
  return {
    calendar_date: "2026-01-05",
    total_steps: 8000,
    resting_hr: 55,
    hrv_last_night_avg: 60,
    waking_avg_hr: 70,
    ...overrides,
  };
}
