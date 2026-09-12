import { useEffect, useState } from "react";
import { formatRelativeTime } from "../lib/format";

const LAST_SYNC_KEY = "walkies:lastSync";

interface LastSync {
  at: string;
  synced: number;
}

function loadLastSync(): LastSync | null {
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastSync;
  } catch {
    return null;
  }
}

interface UpdateButtonProps {
  apiBaseUrl: string;
  onSynced: () => Promise<void> | void;
  onSyncError: (message: string | null) => void;
}

export function UpdateButton({ apiBaseUrl, onSynced, onSyncError }: UpdateButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<LastSync | null>(() => loadLastSync());
  // Re-render periodically so "5m ago" keeps advancing without a manual refresh.
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleClick() {
    setSyncing(true);
    onSyncError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const synced = data.synced as number;
      const record: LastSync = { at: new Date().toISOString(), synced };
      localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(record));
      setLastSync(record);
      await onSynced();
    } catch (err) {
      onSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // The control keeps one name the whole way through — the button says Sync,
  // the in-flight state says Syncing, the result says Synced — so the action
  // is recognisable at every step.
  let statusText: string;
  if (syncing) {
    statusText = "Working…";
  } else if (!lastSync) {
    statusText = "Never synced";
  } else {
    const suffix = lastSync.synced > 0 ? ` · ${lastSync.synced} new` : "";
    statusText = `Synced ${formatRelativeTime(lastSync.at)}${suffix}`;
  }

  return (
    <div className="update-control">
      <button type="button" onClick={handleClick} disabled={syncing} aria-busy={syncing}>
        {syncing ? "Syncing…" : "Sync"}
      </button>
      {/* role="status" so the outcome — how many activities came in, or that
          nothing has ever synced — is announced rather than only drawn.
          Still indeterminate: POST /api/sync returns once, at the end, so
          there is no count to report until it does. */}
      <span className="update-status" role="status">
        {statusText}
      </span>
    </div>
  );
}
