import { useCallback, useEffect, useState } from "react";

interface Status {
  connected: boolean;
  email: string | null;
}

interface GarminConnectProps {
  apiBaseUrl: string;
  accessToken: string;
}

export function GarminConnect({ apiBaseUrl, accessToken }: GarminConnectProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(
    (extra?: Record<string, string>) => ({ Authorization: `Bearer ${accessToken}`, ...extra }),
    [accessToken],
  );

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/garmin-credentials`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ connected: false, email: null }));
  }, [apiBaseUrl, authHeaders]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/garmin-credentials`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Garmin credentials");
      setStatus({ connected: true, email });
      setEditing(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Garmin credentials");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  if (!editing) {
    return (
      <div className="garmin-connect">
        <span
          className={status.connected ? "garmin-connect__dot garmin-connect__dot--on" : "garmin-connect__dot"}
          aria-hidden="true"
        />
        <span className="update-status" title={status.connected ? status.email ?? undefined : undefined}>
          {status.connected ? `Garmin: ${status.email}` : "Garmin: not connected"}
        </span>
        <button type="button" className="garmin-connect__link" onClick={() => setEditing(true)}>
          {status.connected ? "Change" : "Connect"}
        </button>
      </div>
    );
  }

  return (
    <form className="garmin-connect garmin-connect--editing" onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Garmin email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="Garmin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className="garmin-connect__link" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
