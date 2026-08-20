import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { ActivityTable } from "./components/ActivityTable";
import { MapView } from "./components/MapView";
import { StatsView } from "./components/StatsView";
import { UpdateButton } from "./components/UpdateButton";
import { supabase } from "./lib/supabase";
import type { Activity } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

type Tab = "map" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "stats", label: "Statistics" },
];

function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("map");

  const loadActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .order("start_time", { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setActivities((data ?? []) as Activity[]);
  }, []);

  useEffect(() => {
    loadActivities().finally(() => setLoading(false));
  }, [loadActivities]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveTab("map");
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>Garmin Activity Map</h1>
          <UpdateButton apiBaseUrl={API_BASE_URL} onSynced={loadActivities} onSyncError={setSyncError} />
        </header>
        {error && <p className="error-banner">{error}</p>}
        {syncError && (
          <p className="error-banner">
            <strong>Garmin sync failed.</strong> {syncError}
          </p>
        )}
        <div className="sidebar__listbar">
          <span className="eyebrow">Activities</span>
          <span className="eyebrow">{loading ? "—" : activities.length.toLocaleString()}</span>
        </div>
        <div className="sidebar__body">
          {loading ? (
            <p className="empty-state">Loading…</p>
          ) : (
            <ActivityTable
              activities={activities}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
        </div>
      </aside>
      <main className="content-pane">
        <nav className="tabs" role="tablist" aria-label="View">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={activeTab === id}
              aria-controls="view-panel"
              className={activeTab === id ? "tab tab--active" : "tab"}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="content-pane__body" id="view-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "map" ? (
            <MapView activities={activities} hoveredId={hoveredId} onHover={setHoveredId} selectedId={selectedId} />
          ) : (
            <StatsView activities={activities} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
