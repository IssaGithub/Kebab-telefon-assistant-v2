"use client";

import { useState } from "react";
import { apiBaseUrl } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type TestCallState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function TestCallPanel() {
  const { restaurantId } = useSelectedRestaurant();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waitUntilAnswered, setWaitUntilAnswered] = useState(true);
  const [state, setState] = useState<TestCallState>({
    status: "idle",
    message: "Gib die Telefonnummer deines Kunden oder deines eigenen Handys im Format +491701234567 ein."
  });

  async function startTestCall() {
    setState({
      status: "loading",
      message: "Testanruf wird vorbereitet..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/calls/test`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phoneNumber,
          restaurantId: restaurantId || undefined,
          waitUntilAnswered
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
        message: `Demo-Call gestartet. LiveKit Room: ${payload.roomName}. Sage im Gespraech zum Beispiel: "Ich haette gern zwei Doener und eine Cola."`
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
      <div className="demo-call-kicker">LiveKit Demo</div>
      <label className="field-label" htmlFor="test-call-phone">Zielnummer fuer Vorfuehrung</label>
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
          disabled={state.status === "loading" || phoneNumber.trim().length === 0 || restaurantId.trim().length === 0}
          onClick={startTestCall}
          type="button"
        >
          Demo-Call starten
        </button>
      </div>
      <label className="demo-call-option">
        <input
          checked={waitUntilAnswered}
          onChange={(event) => setWaitUntilAnswered(event.target.checked)}
          type="checkbox"
        />
        <span>Auf Annahme warten, damit Fehler direkt sichtbar werden</span>
      </label>
      <div className={`action-note ${state.status}`}>
        {restaurantId ? state.message : "Waehle zuerst ein Restaurant im geschuetzten Dashboard aus."}
      </div>
      <div className="demo-call-script">
        <strong>Vorfuehrungsideen</strong>
        <div>Ich haette gern zwei Doener Teller und eine Cola.</div>
        <div>Lieferung bitte, mein Name ist Samet.</div>
        <div>Meine Adresse ist Hauptstrasse 1 in Berlin.</div>
      </div>
    </div>
  );
}
