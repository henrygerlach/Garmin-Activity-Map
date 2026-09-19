import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeActivity } from "./test/fixtures";

const order = vi.fn();
const select = vi.fn(() => ({ order }));
// Typed with the table name it is called with, so assertions below can read
// `from.mock.calls[n][0]` and get a string rather than an empty tuple.
const from = vi.fn((_table: string) => ({ select }));
const session = { access_token: "token", user: { id: "user-1", email: "person@example.com" } };
const getSession = vi.fn(() => Promise.resolve({ data: { session } }));
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
vi.mock("./lib/supabase", () => ({
  supabase: {
    from: (table: string) => from(table),
    auth: { getSession: () => getSession(), onAuthStateChange, signOut: vi.fn() },
  },
}));

vi.mock("./components/MapView", () => ({
  MapView: ({ activities, selectedId }: { activities: unknown[]; selectedId: string | null }) => (
    <div data-testid="map-view">{activities.length} activities, selected {selectedId ?? "none"}</div>
  ),
}));

vi.mock("./components/GarminConnect", () => ({
  GarminConnect: () => <div data-testid="garmin-connect" />,
}));

const { default: App } = await import("./App");

describe("App", () => {
  it("shows an error banner when loading activities fails", async () => {
    order.mockResolvedValue({ data: null, error: { message: "db unreachable" } });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("db unreachable");
  });

  it("loads activities and renders the activity table and map by default", async () => {
    const activity = makeActivity({ id: "1", name: "Morning walk" });
    order.mockImplementation(() =>
      from.mock.calls.length && from.mock.calls[from.mock.calls.length - 1][0] === "activities"
        ? Promise.resolve({ data: [activity], error: null })
        : Promise.resolve({ data: [], error: null }),
    );
    render(<App />);

    await waitFor(() => expect(screen.getByTestId("map-view")).toHaveTextContent("1 activities"));
    expect(screen.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to the statistics tab and back", async () => {
    order.mockResolvedValue({ data: [], error: null });
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Statistics" }));
    expect(screen.getByRole("tab", { name: "Statistics" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("map-view")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(screen.getByTestId("map-view")).toBeInTheDocument();
  });

  it("selecting an activity switches back to the map tab", async () => {
    const activity = makeActivity({ id: "1" });
    order.mockImplementation(() =>
      from.mock.calls[from.mock.calls.length - 1][0] === "activities"
        ? Promise.resolve({ data: [activity], error: null })
        : Promise.resolve({ data: [], error: null }),
    );
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Statistics" }));
    await userEvent.click(screen.getAllByRole("row")[1]);

    expect(screen.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  });

  it("toggles the sidebar visibility", async () => {
    order.mockResolvedValue({ data: [], error: null });
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const toggle = screen.getByRole("button", { name: "Hide activity list" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show activity list" })).toBeInTheDocument();
    expect(document.getElementById("activity-sidebar")?.className).toMatch(/sidebar--hidden/);
  });
});
