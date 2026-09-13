import { render, waitFor } from "@testing-library/react";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import { describe, expect, it, vi } from "vitest";
import { makeActivity } from "../test/fixtures";
import { FrequencyLayer } from "./FrequencyLayer";

describe("FrequencyLayer", () => {
  it("adds one polyline per frequency segment to the map, and reports the max count", async () => {
    const activities = [
      makeActivity({
        id: "a",
        points: [
          [52.5, 13.4],
          [52.51, 13.41],
        ],
      }),
    ];
    const onMaxCountChange = vi.fn();
    const { container } = render(
      <MapContainer center={[52.5, 13.4]} zoom={13} style={{ height: 200, width: 200 }}>
        <FrequencyLayer activities={activities} onMaxCountChange={onMaxCountChange} />
      </MapContainer>,
    );

    await waitFor(() => expect(onMaxCountChange).toHaveBeenCalledWith(1));
    await waitFor(() => expect(container.querySelectorAll("path.leaflet-interactive").length).toBe(1));
  });

  it("removes its layer group on unmount", async () => {
    const activities = [makeActivity({ points: [[52.5, 13.4], [52.51, 13.41]] })];
    const removeLayerSpy = vi.spyOn(L.Map.prototype, "removeLayer");
    const { unmount } = render(
      <MapContainer center={[52.5, 13.4]} zoom={13} style={{ height: 200, width: 200 }}>
        <FrequencyLayer activities={activities} onMaxCountChange={() => {}} />
      </MapContainer>,
    );
    await waitFor(() => expect(removeLayerSpy.mock.calls.length).toBeGreaterThanOrEqual(0));
    unmount();
    expect(removeLayerSpy).toHaveBeenCalled();
    removeLayerSpy.mockRestore();
  });

  it("renders nothing itself when there are no segments", async () => {
    const onMaxCountChange = vi.fn();
    render(
      <MapContainer center={[52.5, 13.4]} zoom={13} style={{ height: 200, width: 200 }}>
        <FrequencyLayer activities={[]} onMaxCountChange={onMaxCountChange} />
      </MapContainer>,
    );
    await waitFor(() => expect(onMaxCountChange).toHaveBeenCalledWith(0));
  });
});
