import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { ActivityTable } from "./components/ActivityTable";
import { GarminConnect } from "./components/GarminConnect";
import { Login } from "./components/Login";
import { MapView } from "./components/MapView";
import { StatsView } from "./components/StatsView";
import { UpdateButton } from "./components/UpdateButton";
import { useAuth } from "./lib/useAuth";
import { supabase } from "./lib/supabase";
import type { Activity, DailyMetric } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8788";

type Tab = "map" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "stats", label: "Statistics" },
];

function App() {
  const { session, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const loadActivities = useCallback(async () => {
    const [activityResult, metricsResult] = await Promise.all([
      supabase.from("activities").select("*").order("start_time", { ascending: false }),
      supabase.from("daily_metrics").select("*").order("calendar_date", { ascending: true }),
    ]);
    const failure = activityResult.error ?? metricsResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setError(null);
    setActivities((activityResult.data ?? []) as Activity[]);
    setDailyMetrics((metricsResult.data ?? []) as DailyMetric[]);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadActivities().finally(() => setLoading(false));
  }, [session, loadActivities]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveTab("map");
  }, []);

  if (authLoading) return null;
  if (!session) return <Login />;

  return (
    <div className="app">
      <aside className={sidebarVisible ? "sidebar" : "sidebar sidebar--hidden"} id="activity-sidebar">
        <header className="sidebar__header">
          <h1>Garmin Activity Map</h1>
          <UpdateButton
            apiBaseUrl={API_BASE_URL}
            accessToken={session.access_token}
            onSynced={loadActivities}
            onSyncError={setSyncError}
          />
        </header>
        {/* role="alert" so a failure is announced, not only drawn — this is the
            one thing in the app that can silently go wrong. */}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {syncError && (
          <p className="error-banner" role="alert">
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
          {/* Outside the tablist proper — it switches nothing, it just gives the
              map the whole window. Lives here rather than in the sidebar so it
              can still be reached once the sidebar is gone. */}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarVisible((v) => !v)}
            aria-expanded={sidebarVisible}
            aria-controls="activity-sidebar"
            aria-label={sidebarVisible ? "Hide activity list" : "Show activity list"}
            title={sidebarVisible ? "Hide activity list" : "Show activity list"}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <rect
                x="1.5"
                y="2.5"
                width="13"
                height="11"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <line
                x1="6"
                y1="2.5"
                x2="6"
                y2="13.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              {sidebarVisible && <rect x="1.5" y="2.5" width="4.5" height="11" fill="currentColor" opacity="0.35" />}
            </svg>
          </button>
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
          <div className="tabs__account">
            <GarminConnect apiBaseUrl={API_BASE_URL} accessToken={session.access_token} />
            <span className="tabs__email" title={session.user.email}>
              {session.user.email}
            </span>
            <button type="button" className="garmin-connect__link" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </nav>
        <div className="content-pane__body" id="view-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "map" ? (
            <MapView activities={activities} hoveredId={hoveredId} onHover={setHoveredId} selectedId={selectedId} />
          ) : (
            <StatsView activities={activities} dailyMetrics={dailyMetrics} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
