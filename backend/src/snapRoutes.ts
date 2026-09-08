import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HOME_ROUTES, TRIPS, type DemoRoute } from "./demoRoutes.js";

/**
 * Resolves each demo route's hand-placed corners into the real streets and
 * paths that connect them, and writes the result to `demoRouteGeometry.json`.
 *
 * Run with `npm run snap-routes`, and only when a route in `demoRoutes.ts`
 * changes. The output is committed so that seeding stays offline, fast and
 * deterministic — a routing service in the seed path would make every run
 * depend on someone else's uptime and on whichever OSM snapshot they happen to
 * be serving that week.
 *
 * Uses the public Valhalla instance run by the OpenStreetMap community, which
 * needs no API key and — unlike a car-only router — has pedestrian and bicycle
 * costings, so a walking loop follows the footpaths through a park instead of
 * the ring road around it. Only invented coordinates are ever sent to it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "demoRouteGeometry.json");

const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";
// A public service being used for free; one request a second is polite.
const REQUEST_DELAY_MS = 1200;

const COSTING = { walk: "pedestrian", run: "pedestrian", bike: "bicycle" } as const;
// Valhalla refuses more than ten locations in one request, and the longer
// routes have more corners than that, so they go in overlapping chunks.
const MAX_LOCATIONS = 10;

interface ValhallaResponse {
  trip: { legs: { shape: string }[]; summary: { length: number } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decodes Valhalla's shape strings, which are Google encoded polylines at six
 * decimal places rather than the more common five.
 */
function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

async function routeThrough(
  locations: { lat: number; lon: number }[],
  costing: string,
): Promise<{ points: [number, number][]; km: number }> {
  const query = new URLSearchParams({
    json: JSON.stringify({ locations, costing, directions_options: { units: "kilometers" } }),
  });

  const response = await fetch(`${VALHALLA_URL}?${query}`);
  if (!response.ok) throw new Error(`routing failed (${response.status} ${await response.text()})`);

  const { trip } = (await response.json()) as ValhallaResponse;
  const points: [number, number][] = [];
  for (const leg of trip.legs) {
    // Each leg starts where the previous one ended.
    const shape = decodePolyline6(leg.shape);
    points.push(...(points.length === 0 ? shape : shape.slice(1)));
  }
  return { points, km: trip.summary.length };
}

async function snap(route: DemoRoute): Promise<[number, number][]> {
  // The first corner is repeated as the last location, so the router closes the
  // loop along real streets too rather than leaving a straight line home.
  const locations = [...route.waypoints, route.waypoints[0]].map(([lat, lon]) => ({ lat, lon }));

  const points: [number, number][] = [];
  let km = 0;
  // Chunks overlap by one location, so consecutive chunks meet at a shared
  // corner and the route comes back as one continuous line.
  for (let start = 0; start < locations.length - 1; start += MAX_LOCATIONS - 1) {
    if (start > 0) await sleep(REQUEST_DELAY_MS);
    const chunk = await routeThrough(locations.slice(start, start + MAX_LOCATIONS), COSTING[route.type]);
    points.push(...(points.length === 0 ? chunk.points : chunk.points.slice(1)));
    km += chunk.km;
  }

  console.log(`  ${route.id}: ${km.toFixed(1)} km, ${points.length} points`);
  return points;
}

async function main(): Promise<void> {
  const routes = [...HOME_ROUTES, ...TRIPS.flatMap((trip) => trip.routes)];
  console.log(`Snapping ${routes.length} routes to roads…`);

  const geometry: Record<string, [number, number][]> = {};
  for (const route of routes) {
    geometry[route.id] = await snap(route);
    await sleep(REQUEST_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(geometry)}\n`);
  console.log(`Wrote ${OUTPUT_PATH} (${(fs.statSync(OUTPUT_PATH).size / 1e6).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
