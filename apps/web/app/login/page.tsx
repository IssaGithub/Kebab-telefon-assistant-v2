"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl } from "../lib/api";
import { RestaurantOnboardingWizard } from "../components/restaurant-onboarding-wizard";
import { useAuthSession } from "../components/use-auth-session";

type LoginState = {
  status: "idle" | "loading" | "error";
  message: string;
};

export default function LoginPage() {
  const { status } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>({
    status: "idle",
    message: "Melde dich mit dem Inhaber-Account deines Tenants an."
  });

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = "/";
    }
  }, [status]);

  async function login() {
    setState({
      status: "loading",
      message: "Anmeldung laeuft..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          status: "error",
          message:
            payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Anmeldung fehlgeschlagen."
        });
        return;
      }

      window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
      window.location.href = "/";
    } catch {
      setState({
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung."
      });
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="eyebrow">Kebab AI</div>
        <h1>Login und Self-Service Onboarding</h1>
        <p className="muted">
          Erstelle einen neuen Tenant mit Restaurant und Inhaber-Account oder melde dich mit einem bestehenden Zugang
          an.
        </p>
      </section>

      <div className="grid auth-grid">
        <section className="form-card">
          <div>
            <h2>Anmelden</h2>
            <p className="muted">Der Login oeffnet dein tenant-scoped Dashboard mit HTTP-only Session-Cookie.</p>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span>E-Mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Passwort</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          </div>

          <div className="form-actions">
            <button
              className="button"
              type="button"
              disabled={state.status === "loading" || !email.trim() || password.trim().length < 8}
              onClick={login}
            >
              Anmelden
            </button>
            <span className={`form-message ${state.status}`}>{state.message}</span>
          </div>
        </section>

        <RestaurantOnboardingWizard publicMode />
      </div>
    </div>
  );
}
