"use client";

import { useState } from "react";
import { apiBaseUrl, fetchJson, formatMoney, type DemoCallSession } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type ViewState = {
  status: "idle" | "loading" | "error" | "success";
  message: string;
};

export function DemoCallPanel() {
  const { restaurantId } = useSelectedRestaurant();
  const [callerNumber, setCallerNumber] = useState("+491701234567");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<DemoCallSession | null>(null);
  const [state, setState] = useState<ViewState>({
    status: "idle",
    message: "Starte einen Demo-Anruf und fuehre das Bestellgespraech direkt im Dashboard."
  });

  async function startDemoCall() {
    if (!restaurantId) {
      return;
    }

    setState({
      status: "loading",
      message: "Demo-Anruf wird gestartet..."
    });

    try {
      const payload = await fetchJson<DemoCallSession>(`/v1/restaurants/${restaurantId}/demo-call`, {
        method: "POST",
        body: JSON.stringify({
          callerNumber
        })
      });

      setSession(payload);
      setState({
        status: "success",
        message: "Demo-Anruf gestartet. Du kannst jetzt als Anrufer schreiben."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Demo-Anruf konnte nicht gestartet werden."
      });
    }
  }

  async function sendMessage() {
    if (!session || message.trim().length === 0) {
      return;
    }

    setState({
      status: "loading",
      message: "Nachricht wird verarbeitet..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/demo-calls/${session.callId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message
        })
      });

      const payload = (await response.json().catch(() => null)) as DemoCallSession | { message?: string } | null;

      if (!response.ok || !payload || !("callId" in payload)) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Nachricht konnte nicht verarbeitet werden."
        );
      }

      setSession(payload);
      setMessage("");
      setState({
        status: "success",
        message:
          payload.order.status === "pending_restaurant"
            ? "Bestellung abgeschlossen. Sie erscheint jetzt in den Bestellungen und im Anrufprotokoll."
            : "Antwort vom Demo-Agenten aktualisiert."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Nachricht konnte nicht verarbeitet werden."
      });
    }
  }

  return (
    <section className="card stack-md">
      <div className="page-header demo-panel-header">
        <div>
          <div className="eyebrow">Vertikaler Slice</div>
          <h2>KI-Telefonassistent Demo</h2>
          <p className="muted">
            Diese Demo simuliert einen eingehenden Restaurantanruf, fuehrt das Gespraech und schreibt echte Call- und
            Order-Daten in die Datenbank.
          </p>
        </div>
      </div>

      <div className="demo-panel-grid">
        <div className="form-card">
          <label className="form-field">
            <span>Anrufernummer</span>
            <input value={callerNumber} onChange={(event) => setCallerNumber(event.target.value)} />
          </label>

          <button
            className="button"
            type="button"
            disabled={!restaurantId || state.status === "loading"}
            onClick={startDemoCall}
          >
            Demo-Anruf starten
          </button>

          <div className={`form-message ${state.status}`}>{restaurantId ? state.message : "Waehle zuerst ein Restaurant."}</div>

          <div className="demo-hints">
            <strong>Beispielsätze</strong>
            <div className="muted">"Ich haette gern 2x Doener Teller."</div>
            <div className="muted">"Lieferung bitte, mein Name ist Samet."</div>
            <div className="muted">"Meine Adresse ist Hauptstrasse 1 in Berlin."</div>
            <div className="muted">"Meine Nummer ist +491701234567."</div>
            <div className="muted">"Das war alles."</div>
          </div>
        </div>

        <div className="card inset-card stack-md">
          <div className="demo-chat">
            {session?.messages.length ? (
              session.messages.map((entry, index) => (
                <div className={`demo-message ${entry.role}`} key={`${entry.role}-${index}`}>
                  <strong>{entry.role === "assistant" ? "Agent" : "Anrufer"}</strong>
                  <div>{entry.text}</div>
                </div>
              ))
            ) : (
              <div className="empty-state">Noch kein Demo-Gespraech gestartet.</div>
            )}
          </div>

          <div className="inline-form">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Sag dem Agenten, was bestellt wird"
              disabled={!session}
            />
            <button className="button button-secondary" type="button" disabled={!session || !message.trim()} onClick={sendMessage}>
              Senden
            </button>
          </div>
        </div>
      </div>

      <div className="card inset-card stack-md">
        <div className="status-row">
          <div>
            <strong>Aktuelle Demo-Bestellung</strong>
            <div className="muted">
              {session
                ? `${session.order.fulfillmentType} · ${session.order.status}`
                : "Die Zusammenfassung erscheint nach dem Start des Demo-Anrufs."}
            </div>
          </div>
          {session ? <span className="pill">{formatMoney(session.order.totalCents, session.order.currency)}</span> : null}
        </div>

        {session ? (
          <>
            <div className="status-row">
              <div>
                <strong>Kunde</strong>
                <div className="muted">
                  {session.order.customerName ?? "Noch kein Name"} · {session.order.customerPhone ?? "Noch keine Nummer"}
                </div>
              </div>
              <span className={session.order.deliveryAddress ? "pill" : "pill warning"}>
                {session.order.deliveryAddress ?? "Keine Lieferadresse"}
              </span>
            </div>

            <div className="demo-order-items">
              {session.order.items.length === 0 ? (
                <div className="empty-state">Noch keine Artikel im Warenkorb.</div>
              ) : (
                session.order.items.map((item) => (
                  <div className="order-row" key={item.id}>
                    <div>
                      <strong>{item.quantity}x {item.name}</strong>
                    </div>
                    <span className="pill">{formatMoney(item.totalCents, session.order.currency)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
