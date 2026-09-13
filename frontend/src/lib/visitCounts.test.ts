import { describe, expect, it } from "vitest";
import { makeActivity } from "../test/fixtures";
import { createVisitIndex, nearestPointOnTrack } from "./visitCounts";

describe("createVisitIndex", () => {
  it("counts one activity as visiting its own points", () => {
    const activity = makeActivity({ points: [[52.5, 13.4], [52.5001, 13.4001]] });
    const index = createVisitIndex([activity]);
    expect(index.countAt(52.5, 13.4)).toBe(1);
  });

  it("counts two overlapping activities as visiting the same spot", () => {
    const a = makeActivity({ id: "a", points: [[52.5, 13.4], [52.5005, 13.4005]] });
    const b = makeActivity({ id: "b", points: [[52.5, 13.4], [52.5006, 13.4006]] });
    const index = createVisitIndex([a, b]);
    expect(index.countAt(52.5, 13.4)).toBe(2);
  });

  it("does not count a far-away activity", () => {
    const a = makeActivity({ id: "a", points: [[52.5, 13.4], [52.5005, 13.4005]] });
    const far = makeActivity({ id: "far", points: [[10, 10], [10.001, 10.001]] });
    const index = createVisitIndex([a, far]);
    expect(index.countAt(52.5, 13.4)).toBe(1);
  });

  it("handles activities with no points", () => {
    const index = createVisitIndex([]);
    expect(index.countAt(0, 0)).toBe(0);
  });
});

describe("nearestPointOnTrack", () => {
  it("returns null for an empty track", () => {
    expect(nearestPointOnTrack([], 1, 1)).toBeNull();
  });

  it("returns the single point for a one-point track", () => {
    expect(nearestPointOnTrack([[1, 1]], 5, 5)).toEqual([1, 1]);
  });

  it("finds the closest point along a segment, not just an endpoint", () => {
    const points: [number, number][] = [
      [0, 0],
      [0, 10],
    ];
    const nearest = nearestPointOnTrack(points, 1, 5);
    expect(nearest![0]).toBeCloseTo(0, 5);
    expect(nearest![1]).toBeCloseTo(5, 5);
  });

  it("clamps to a segment's endpoint when the query is beyond it", () => {
    const points: [number, number][] = [
      [0, 0],
      [0, 10],
    ];
    const nearest = nearestPointOnTrack(points, 0, -5);
    expect(nearest).toEqual([0, 0]);
  });
});
