import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateButton } from "./UpdateButton";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UpdateButton", () => {
  it("shows 'Never synced' with nothing in localStorage", () => {
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Never synced");
  });

  it("shows the last sync time and count from localStorage", () => {
    localStorage.setItem("walkies:lastSync", JSON.stringify({ at: new Date().toISOString(), synced: 4 }));
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("4 new");
  });

  it("ignores unparsable localStorage content", () => {
    localStorage.setItem("walkies:lastSync", "not json");
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Never synced");
  });

  it("syncs successfully, persists the result, and calls onSynced", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ synced: 2 }),
    });
    const onSynced = vi.fn();
    const onSyncError = vi.fn();
    render(<UpdateButton apiBaseUrl="http://api" accessToken="token" onSynced={onSynced} onSyncError={onSyncError} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 new"));
    expect(fetch).toHaveBeenCalledWith("http://api/api/sync", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });
    expect(onSynced).toHaveBeenCalled();
    expect(onSyncError).toHaveBeenCalledWith(null);
    expect(JSON.parse(localStorage.getItem("walkies:lastSync")!).synced).toBe(2);
  });

  it("reports a server-provided error message and does not persist a sync", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "boom" }),
    });
    const onSyncError = vi.fn();
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={onSyncError} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onSyncError).toHaveBeenLastCalledWith("boom"));
    expect(localStorage.getItem("walkies:lastSync")).toBeNull();
  });

  it("reports a generic error message for a network failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("network down"));
    const onSyncError = vi.fn();
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={onSyncError} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onSyncError).toHaveBeenLastCalledWith("network down"));
  });

  it("disables the button while syncing", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<UpdateButton apiBaseUrl="" accessToken="token" onSynced={() => {}} onSyncError={() => {}} />);

    const user = userEvent.setup();
    const clickPromise = user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());

    resolveFetch({ ok: true, json: async () => ({ synced: 0 }) });
    await clickPromise;
  });
});
