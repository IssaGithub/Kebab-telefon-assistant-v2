"use client";

import { useEffect, useState } from "react";
import { fetchJson, formatDate, formatMoney, type OrderRecord } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

export function OrdersPanel() {
  const { restaurantId } = useSelectedRestaurant();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [message, setMessage] = useState("Lade Bestellungen...");

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

    return () => {
      active = false;
    };
  }, [restaurantId]);

  return (
    <section className="card">
      <h2>Aktuelle Bestellungen</h2>
      {orders.length === 0 ? (
        <div className="empty-state">{message}</div>
      ) : (
        orders.map((order) => (
          <div className="order-row" key={order.id}>
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
        ))
      )}
    </section>
  );
}
