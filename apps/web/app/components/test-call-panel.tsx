"use client";

import { useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type TestCallState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function TestCallPanel() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [state, setState] = useState<TestCallState>({
    status: "idle",
    message: "Gib eine Zielnummer im Format +491701234567 ein."
  });

  async function startTestCall() {
    setState({
      status: "loading",
      message: "Testanruf wird vorbereitet..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/calls/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phoneNumber
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (payload?.error === "livekit_not_configured") {
          setState({
            status: "error",
            message: `LiveKit ist noch nicht konfiguriert. Fehlend: ${payload.missing?.join(", ") ?? "Konfiguration"}`
          });
          return;
        }

        if (payload?.error === "validation_error") {
          setState({
            status: "error",
            message: "Bitte nutze eine Telefonnummer im E.164 Format, z. B. +491701234567."
          });
          return;
        }

        setState({
          status: "error",
          message: payload?.message ?? "Testanruf konnte nicht gestartet werden."
        });
        return;
      }

      setState({
        status: "success",
        message: `Testanruf gestartet. LiveKit Room: ${payload.roomName}`
      });
    } catch {
      setState({
        status: "error",
        message: "API nicht erreichbar. Starte die API mit npm run dev -w @restaurant-ai/api."
      });
    }
  }

  return (
    <div className="test-call-panel">
      <label className="field-label" htmlFor="test-call-phone">Testnummer</label>
      <div className="inline-form">
        <input
          id="test-call-phone"
          inputMode="tel"
          onChange={(event) => setPhoneNumber(event.target.value)}
          placeholder="+491701234567"
          type="tel"
          value={phoneNumber}
        />
        <button
          className="button"
          disabled={state.status === "loading" || phoneNumber.trim().length === 0}
          onClick={startTestCall}
          type="button"
        >
          Testanruf starten
        </button>
      </div>
      <div className={`action-note ${state.status}`}>{state.message}</div>
    </div>
  );
}

