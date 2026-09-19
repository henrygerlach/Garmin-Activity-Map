import { useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "sign-in" | "sign-up";

export function Login() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === "sign-up") setInfo("Account created. Check your email to confirm it, then sign in.");
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="login-panel__brand">
          {/* Three routes meeting at one point — the same idea the activity
              list's own RouteGlyph carries per row, standing in for a logo. */}
          <svg className="login-mark" viewBox="0 0 28 22" width="28" height="22" aria-hidden="true">
            <path className="trace trace--walk" d="M2 20 L14 11" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className="trace trace--run" d="M26 20 L14 11" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className="trace trace--bike" d="M14 11 L14 2" fill="none" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="login-panel__name">Garmin Activity Map</span>
        </div>
        <p className="login-panel__mode">{mode === "sign-in" ? "Sign in" : "Create account"}</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-form__field">
            <span className="login-form__label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            />
          </label>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="update-status" role="status">
              {info}
            </p>
          )}
          <button type="submit" className="login-form__submit" disabled={busy}>
            {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button
          type="button"
          className="login-form__switch"
          onClick={() => {
            setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
