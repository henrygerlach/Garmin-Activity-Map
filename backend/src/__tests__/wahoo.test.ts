import { describe, expect, it } from "vitest";
import { matchWorkouts, type MatchTarget, type WahooWorkout } from "../wahoo.js";

function workout(id: number, start: string, durationS: number): WahooWorkout {
  return {
    wahoo_workout_id: id,
    start_time: start,
    duration_s: durationS,
    avg_power_w: 200,
    norm_power_w: 215,
    tss: 60,
    work_kj: 700,
    avg_cadence_rpm: 85,
  };
}

function activity(id: string, start: string, durationS: number): MatchTarget {
  return { id, start_time: start, duration_s: durationS };
}

describe("matchWorkouts", () => {
  it("pairs recordings of the same outing started minutes apart", () => {
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 3600)],
      [activity("a", "2026-09-01T06:04:00.000Z", 3500)],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ activity_id: "a" });
    expect(matches[0].workout.wahoo_workout_id).toBe(1);
  });

  it("leaves an activity alone when nothing overlaps it", () => {
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 3600)],
      [activity("a", "2026-09-01T18:00:00.000Z", 3600)],
    );

    expect(matches).toEqual([]);
  });

  it("rejects a brief overlap between two separate outings", () => {
    // The ride ends as the run begins; five minutes of overlap is not half of
    // either, so neither should claim the other.
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 3600)],
      [activity("a", "2026-09-01T06:55:00.000Z", 3600)],
    );

    expect(matches).toEqual([]);
  });

  it("gives each recording to its nearest activity, not the first that fits", () => {
    // Two rides back to back, both overlapping both recordings enough to
    // qualify. Start time has to break the tie the right way round.
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 3600), workout(2, "2026-09-01T06:30:00.000Z", 3600)],
      [activity("a", "2026-09-01T06:28:00.000Z", 3600), activity("b", "2026-09-01T06:02:00.000Z", 3600)],
    );

    expect(matches).toHaveLength(2);
    const byWorkout = new Map(matches.map((m) => [m.workout.wahoo_workout_id, m.activity_id]));
    expect(byWorkout.get(1)).toBe("b");
    expect(byWorkout.get(2)).toBe("a");
  });

  it("never lets two recordings claim the same activity", () => {
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 3600), workout(2, "2026-09-01T06:01:00.000Z", 3600)],
      [activity("a", "2026-09-01T06:00:30.000Z", 3600)],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].workout.wahoo_workout_id).toBe(1);
  });

  it("skips a recording with no duration rather than matching it to anything", () => {
    const matches = matchWorkouts(
      [workout(1, "2026-09-01T06:00:00.000Z", 0)],
      [activity("a", "2026-09-01T06:00:00.000Z", 3600)],
    );

    expect(matches).toEqual([]);
  });
});
