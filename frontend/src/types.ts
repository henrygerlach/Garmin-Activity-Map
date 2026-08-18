export type ActivityKind = "walk" | "bike";

export interface Activity {
  id: string;
  garmin_activity_id: number;
  name: string;
  type: ActivityKind;
  start_time: string;
  distance_m: number;
  duration_s: number;
  moving_duration_s: number;
  avg_speed_mps: number | null;
  avg_hr: number | null;
  points: [number, number][];
}
