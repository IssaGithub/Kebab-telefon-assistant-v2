"use client";

import { useEffect, useState } from "react";
import { fetchJson, formatDate, formatMoney, type OrderRecord } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

const REFRESH_INTERVAL_MS = 5000;

export function OrdersPanel() {
  const { restaurantId } = useSelectedRestaurant();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [message, setMessage] = useState("Lade Bestellungen...");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!restaurantId) {
        setOrders([]);
        setMessage("Waehle zuerst ein Restaurant im Onboarding oder Dashboard.");
        return;
      }

      try {
        const payload = await fetchJson<OrderRecord[]>(`/v1/restaurants/${restaurantId}/orders`);

        if (!active) {
          return;
        }

        setOrders(payload);
        setMessage(payload.length === 0 ? "Noch keine Bestellungen vorhanden." : "");
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Bestellungen konnten nicht geladen werden.");
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [restaurantId]);

  return (
    <section className="card">
      <h2>Aktuelle Bestellungen</h2>
      {orders.length === 0 ? (
        <div className="empty-state">{message}</div>
      ) : (
        orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-row">
              <div>
                <strong>{order.customerName ?? order.customerPhone ?? "Unbekannter Kunde"}</strong>
                <div className="muted">{order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ") || "Ohne Artikel"}</div>
                <div className="muted">{formatDate(order.createdAt)}</div>
              </div>
              <div className="align-end">
                <span className={order.status === "pending_restaurant" ? "pill warning" : "pill"}>{order.status}</span>
                <div className="muted">{formatMoney(order.totalCents, order.currency)}</div>
              </div>
            </div>

            <div className="order-meta">
              <div className="muted">Telefon: {order.customerPhone ?? "nicht hinterlegt"}</div>
              <div className="muted">Erfuellung: {order.fulfillmentType === "delivery" ? "Lieferung" : "Abholung"}</div>
              {order.deliveryAddress ? <div className="muted">Adresse: {order.deliveryAddress}</div> : null}
              {order.call ? (
                <div className="muted">
                  Anruf: {order.call.status}
                  {order.call.callerNumber ? ` · ${order.call.callerNumber}` : ""}
                </div>
              ) : null}
            </div>

            <div className="button-row">
              {order.status === "pending_restaurant" ? (
                <>
                  <button
                    className="button"
                    type="button"
                    disabled={pendingOrderId === order.id}
                    onClick={() => updateStatus(order.id, "accepted")}
                  >
                    Annehmen
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={pendingOrderId === order.id}
                    onClick={() => updateStatus(order.id, "rejected")}
                  >
                    Ablehnen
                  </button>
                </>
              ) : null}

              {order.status === "accepted" ? (
                <button
                  className="button"
                  type="button"
                  disabled={pendingOrderId === order.id}
                  onClick={() => updateStatus(order.id, "completed")}
                >
                  Als erledigt markieren
                </button>
              ) : null}
            </div>

            {order.events?.length ? (
              <div className="order-events">
                {order.events.slice(0, 3).map((event) => (
                  <div className="muted" key={event.id}>
                    {event.status} · {formatDate(event.createdAt)}
                    {event.note ? ` · ${event.note}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))
      )}
    </section>
  );

  async function updateStatus(orderId: string, status: "accepted" | "rejected" | "completed") {
    setPendingOrderId(orderId);

    try {
      await fetchJson(`/v1/orders/${orderId}/status`, {
        method: "POST",
        body: JSON.stringify({
          status
        })
      });

      const refreshedOrders = await fetchJson<OrderRecord[]>(`/v1/restaurants/${restaurantId}/orders`);
      setOrders(refreshedOrders);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bestellstatus konnte nicht aktualisiert werden.");
    } finally {
      setPendingOrderId(null);
    }
  }
}
