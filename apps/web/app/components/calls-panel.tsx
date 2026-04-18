"use client";

import { useEffect, useState } from "react";
import { fetchJson, formatDate, type CallRecord } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

export function CallsPanel() {
  const { restaurantId } = useSelectedRestaurant();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [message, setMessage] = useState("Lade Anrufe...");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!restaurantId) {
        setCalls([]);
        setMessage("Waehle zuerst ein Restaurant im Dashboard.");
        return;
      }

      try {
        const payload = await fetchJson<CallRecord[]>(`/v1/restaurants/${restaurantId}/calls`);

        if (!active) {
          return;
        }

        setCalls(payload);
        setMessage(payload.length === 0 ? "Noch keine Anrufe vorhanden." : "");
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Anrufe konnten nicht geladen werden.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [restaurantId]);

  return (
    <section className="card">
      <h2>Letzte Anrufe</h2>
      {calls.length === 0 ? (
        <div className="empty-state">{message}</div>
      ) : (
        calls.map((call) => (
          <div className="order-row" key={call.id}>
            <div>
              <strong>{call.callerNumber ?? "Unbekannt"}</strong>
              <div className="muted">
                {call.direction} - {call.status}
              </div>
              <div className="muted">{formatDate(call.startedAt)}</div>
            </div>
            <span className="pill">{call.status}</span>
          </div>
        ))
      )}
    </section>
  );
}
