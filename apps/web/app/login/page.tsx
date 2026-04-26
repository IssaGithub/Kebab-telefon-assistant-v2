"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiBaseUrl } from "../lib/api";
import { RestaurantOnboardingWizard } from "../components/restaurant-onboarding-wizard";
import { useAuthSession } from "../components/use-auth-session";

type StatusState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

type LinkState = StatusState & {
  token: string;
  url: string;
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-layout">
          <section className="form-card">Lade Login...</section>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const { status } = useAuthSession();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [loginState, setLoginState] = useState<StatusState>({
    status: "idle",
    message: "Melde dich mit dem Inhaber-Account deines Tenants an."
  });
  const [resetState, setResetState] = useState<LinkState>({
    status: "idle",
    message: "Fordere einen Reset an oder setze das Passwort direkt mit einem Token zurueck.",
    token: "",
    url: ""
  });
  const [verificationState, setVerificationState] = useState<LinkState>({
    status: "idle",
    message: "Bestaetige die E-Mail Adresse aus dem Link oder fordere eine neue Verifizierung an.",
    token: "",
    url: ""
  });

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = "/";
    }
  }, [status]);

  useEffect(() => {
    const incomingResetToken = searchParams.get("resetToken");
    const incomingVerifyToken = searchParams.get("verifyToken");

    if (incomingResetToken) {
      setResetToken(incomingResetToken);
      setResetState((current) => ({
        ...current,
        token: incomingResetToken,
        message: "Reset-Token aus dem Link uebernommen. Gib jetzt ein neues Passwort ein."
      }));
    }

    if (incomingVerifyToken) {
      setVerificationToken(incomingVerifyToken);
      setVerificationState((current) => ({
        ...current,
        token: incomingVerifyToken,
        message: "Verifizierungs-Token aus dem Link uebernommen. Bestaetige jetzt die E-Mail Adresse."
      }));
    }
  }, [searchParams]);

  async function login() {
    setLoginState({
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
        const errorCode =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "";
        const message =
          payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Anmeldung fehlgeschlagen.";

        if (errorCode === "email_not_verified") {
          setVerificationEmail(email);
        }

        setLoginState({
          status: "error",
          message
        });
        return;
      }

      window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
      window.location.href = "/";
    } catch {
      setLoginState({
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung."
      });
    }
  }

  async function requestReset() {
    setResetState({
      status: "loading",
      message: "Passwort-Reset wird vorbereitet...",
      token: "",
      url: ""
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/request-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: resetEmail
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setResetState({
          status: "error",
          message:
            payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Reset konnte nicht vorbereitet werden.",
          token: "",
          url: ""
        });
        return;
      }

      const token =
        payload && typeof payload === "object" && "resetToken" in payload && typeof payload.resetToken === "string"
          ? payload.resetToken
          : "";
      const url =
        payload && typeof payload === "object" && "resetUrl" in payload && typeof payload.resetUrl === "string"
          ? payload.resetUrl
          : "";

      if (token) {
        setResetToken(token);
      }

      setResetState({
        status: "success",
        message:
          token.length > 0
            ? "Reset vorbereitet. Token und URL werden in dieser lokalen Version direkt angezeigt."
            : "Wenn die E-Mail existiert, wurde ein Reset vorbereitet.",
        token,
        url
      });
    } catch {
      setResetState({
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung.",
        token: "",
        url: ""
      });
    }
  }

  async function completeReset() {
    setResetState((current) => ({
      ...current,
      status: "loading",
      message: "Passwort wird zurueckgesetzt..."
    }));

    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: resetToken,
          password: resetPassword
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setResetState((current) => ({
          ...current,
          status: "error",
          message:
            payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Passwort konnte nicht zurueckgesetzt werden."
        }));
        return;
      }

      window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
      window.location.href = "/";
    } catch {
      setResetState((current) => ({
        ...current,
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung."
      }));
    }
  }

  async function requestVerification() {
    setVerificationState({
      status: "loading",
      message: "Verifizierung wird vorbereitet...",
      token: "",
      url: ""
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/request-email-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: verificationEmail
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setVerificationState({
          status: "error",
          message:
            payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Verifizierung konnte nicht vorbereitet werden.",
          token: "",
          url: ""
        });
        return;
      }

      const token =
        payload &&
        typeof payload === "object" &&
        "verificationToken" in payload &&
        typeof payload.verificationToken === "string"
          ? payload.verificationToken
          : "";
      const url =
        payload &&
        typeof payload === "object" &&
        "verificationUrl" in payload &&
        typeof payload.verificationUrl === "string"
          ? payload.verificationUrl
          : "";

      if (token) {
        setVerificationToken(token);
      }

      setVerificationState({
        status: "success",
        message:
          token.length > 0
            ? "Verifizierung vorbereitet. Token und URL werden in dieser lokalen Version direkt angezeigt."
            : "Wenn ein unverifizierter Account existiert, wurde eine Bestaetigung vorbereitet.",
        token,
        url
      });
    } catch {
      setVerificationState({
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung.",
        token: "",
        url: ""
      });
    }
  }

  async function completeVerification() {
    setVerificationState((current) => ({
      ...current,
      status: "loading",
      message: "E-Mail wird bestaetigt..."
    }));

    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: verificationToken
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setVerificationState((current) => ({
          ...current,
          status: "error",
          message:
            payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "E-Mail konnte nicht bestaetigt werden."
        }));
        return;
      }

      window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
      window.location.href = "/";
    } catch {
      setVerificationState((current) => ({
        ...current,
        status: "error",
        message: "API nicht erreichbar. Bitte pruefe die Verbindung."
      }));
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="eyebrow">Kebab AI</div>
        <h1>Login, Verifizierung, Passwort-Reset und Client-Registrierung</h1>
        <p className="muted">
          Registriere einen neuen Client mit Restaurant und Inhaber-Account, bestaetige die E-Mail Adresse, melde
          dich an oder setze das Passwort zurueck.
        </p>
      </section>

      <div className="grid auth-grid">
        <div className="stack-lg">
          <section className="form-card">
            <div>
              <h2>Anmelden</h2>
              <p className="muted">
                Der Login oeffnet dein tenant-scoped Dashboard mit HTTP-only Session-Cookie. Unverifizierte Accounts
                muessen zuerst die E-Mail bestaetigen.
              </p>
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
                disabled={loginState.status === "loading" || !email.trim() || password.trim().length < 8}
                onClick={login}
              >
                Anmelden
              </button>
              <span className={`form-message ${loginState.status}`}>{loginState.message}</span>
            </div>
          </section>

          <section className="form-card">
            <div>
              <h2>E-Mail bestaetigen</h2>
              <p className="muted">
                Nach der Registrierung wird ein Bestaetigungs-Link verschickt. Lokal werden Token und URL direkt
                angezeigt.
              </p>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>Verifizierungs-E-Mail</span>
                <input
                  type="email"
                  value={verificationEmail}
                  onChange={(event) => setVerificationEmail(event.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Verifizierungs-Token</span>
                <input value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} />
              </label>
            </div>

            {verificationState.token ? (
              <div className="token-box">
                <strong>Verifizierungs-Token</strong>
                <code>{verificationState.token}</code>
                {verificationState.url ? <code>{verificationState.url}</code> : null}
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={verificationState.status === "loading" || !verificationEmail.trim()}
                onClick={requestVerification}
              >
                Verifizierung senden
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={verificationState.status === "loading" || verificationToken.trim().length < 20}
                onClick={completeVerification}
              >
                E-Mail bestaetigen
              </button>
            </div>

            <span className={`form-message ${verificationState.status}`}>{verificationState.message}</span>
          </section>

          <section className="form-card">
            <div>
              <h2>Passwort zuruecksetzen</h2>
              <p className="muted">
                Wenn SMTP konfiguriert ist, wird der Reset-Link per E-Mail verschickt. Lokal werden Token und URL
                direkt angezeigt.
              </p>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>Reset-E-Mail</span>
                <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Reset-Token</span>
                <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Neues Passwort</span>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                />
              </label>
            </div>

            {resetState.token ? (
              <div className="token-box">
                <strong>Reset-Token</strong>
                <code>{resetState.token}</code>
                {resetState.url ? <code>{resetState.url}</code> : null}
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={resetState.status === "loading" || !resetEmail.trim()}
                onClick={requestReset}
              >
                Reset anfordern
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={
                  resetState.status === "loading" || resetToken.trim().length < 20 || resetPassword.trim().length < 8
                }
                onClick={completeReset}
              >
                Passwort zuruecksetzen
              </button>
            </div>

            <span className={`form-message ${resetState.status}`}>{resetState.message}</span>
          </section>
        </div>

        <RestaurantOnboardingWizard publicMode />
      </div>
    </div>
  );
}
