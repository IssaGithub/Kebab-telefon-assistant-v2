"use client";

import { useEffect, useState } from "react";
import { fetchJson, formatMoney, type RestaurantDetail } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type Props = {
  section: "dashboard" | "restaurants";
};

export function RestaurantDataPanel({ section }: Props) {
  const { restaurantId, setRestaurantId } = useSelectedRestaurant();
  const [restaurants, setRestaurants] = useState<Array<{ id: string; name: string; city: string }>>([]);
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [message, setMessage] = useState("Lade Restaurantdaten...");

  useEffect(() => {
    let active = true;

    async function loadRestaurants() {
      try {
        const payload = await fetchJson<Array<{ id: string; name: string; city: string }>>("/v1/restaurants");

        if (!active) {
          return;
        }

        setRestaurants(payload);

        if (!restaurantId && payload[0]) {
          setRestaurantId(payload[0].id);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Restaurants konnten nicht geladen werden.");
        }
      }
    }

    void loadRestaurants();

    return () => {
      active = false;
    };
  }, [restaurantId, setRestaurantId]);

  useEffect(() => {
    let active = true;

    async function loadRestaurant() {
      if (!restaurantId) {
        setRestaurant(null);
        setMessage("Waehle oder erstelle zuerst ein Restaurant.");
        return;
      }

      try {
        const payload = await fetchJson<RestaurantDetail>(`/v1/restaurants/${restaurantId}`);

        if (!active) {
          return;
        }

        setRestaurant(payload);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Restaurantdetails konnten nicht geladen werden.");
        }
      }
    }

    void loadRestaurant();

    return () => {
      active = false;
    };
  }, [restaurantId]);

  if (!restaurantId || !restaurant) {
    return (
      <section className="card">
        <h2>{section === "dashboard" ? "Aktives Restaurant" : "Restaurantstatus"}</h2>
        <p className="muted">{message}</p>
      </section>
    );
  }

  const menuCount = restaurant.menus.length;
  const itemCount = restaurant.menus.flatMap((menu) => menu.categories.flatMap((category) => category.items)).length;
  const activePhone = restaurant.phoneNumbers.find((phoneNumber) => phoneNumber.isActive);

  return (
    <section className="card stack-md">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Aktives Restaurant</div>
          <h2>{restaurant.name}</h2>
          <p className="muted">
            {restaurant.addressLine1}, {restaurant.postalCode} {restaurant.city}
          </p>
        </div>

        <label className="form-field" style={{ minWidth: 240 }}>
          <span>Restaurant wechseln</span>
          <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
            {restaurants.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} - {option.city}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="metrics metrics-compact">
        <div className="card inset-card">
          <div className="metric-value">{menuCount}</div>
          <div className="muted">Menues</div>
        </div>
        <div className="card inset-card">
          <div className="metric-value">{itemCount}</div>
          <div className="muted">Artikel</div>
        </div>
        <div className="card inset-card">
          <div className="metric-value">{restaurant.orders.length}</div>
          <div className="muted">letzte Orders</div>
        </div>
        <div className="card inset-card">
          <div className="metric-value">{restaurant.calls.length}</div>
          <div className="muted">letzte Calls</div>
        </div>
      </div>

      <div className="status-list">
        <div className="status-row">
          <div>
            <strong>Tenant</strong>
            <div className="muted">{restaurant.tenant?.name} - {restaurant.tenant?.slug}</div>
          </div>
          <span className="pill">{restaurant.onboardingStatus}</span>
        </div>
        <div className="status-row">
          <div>
            <strong>Aktive Nummer</strong>
            <div className="muted">{activePhone ? `${activePhone.e164} - ${activePhone.provider}` : "Noch nicht aktiviert"}</div>
          </div>
          <span className={activePhone ? "pill" : "pill warning"}>{activePhone ? "Verbunden" : "Offen"}</span>
        </div>
        <div className="status-row">
          <div>
            <strong>Neueste Bestellung</strong>
            <div className="muted">
              {restaurant.orders[0]
                ? `${restaurant.orders[0].items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}`
                : "Noch keine Bestellung"}
            </div>
          </div>
          <span className={restaurant.orders[0] ? "pill" : "pill warning"}>
            {restaurant.orders[0] ? formatMoney(restaurant.orders[0].totalCents, restaurant.orders[0].currency) : "Leer"}
          </span>
        </div>
      </div>
    </section>
  );
}
