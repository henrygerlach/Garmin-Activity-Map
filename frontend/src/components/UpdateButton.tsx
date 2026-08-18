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

  let statusText: string;
  if (syncing) {
    statusText = "Syncing…";
  } else if (!lastSync) {
    statusText = "Never synced";
  } else {
    const suffix = lastSync.synced > 0 ? ` (${lastSync.synced} new)` : "";
    statusText = `Last synced ${formatRelativeTime(lastSync.at)}${suffix}`;
  }

  return (
    <div className="update-control">
      <button onClick={handleClick} disabled={syncing}>
        {syncing ? "Syncing…" : "Update"}
      </button>
      <span className="update-status">{statusText}</span>
    </div>
  );
}
