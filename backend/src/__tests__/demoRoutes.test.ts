import { describe, expect, it } from "vitest";
import { HOME_ROUTES, TRIPS } from "../demoRoutes.js";

const allRoutes = [...HOME_ROUTES, ...TRIPS.flatMap((trip) => trip.routes)];

describe("demoRoutes", () => {
  it("gives every route a unique id", () => {
    const ids = allRoutes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("closes every route into a loop of at least three corners", () => {
    for (const route of allRoutes) {
      expect(route.waypoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives every route a positive weight", () => {
    for (const route of allRoutes) {
      expect(route.weight).toBeGreaterThan(0);
    }
  });

  it("keeps every waypoint as valid [lat, lng]", () => {
    for (const route of allRoutes) {
      for (const [lat, lng] of route.waypoints) {
        expect(lat).toBeGreaterThan(-90);
        expect(lat).toBeLessThan(90);
        expect(lng).toBeGreaterThan(-180);
        expect(lng).toBeLessThan(180);
      }
    }
  });
});
