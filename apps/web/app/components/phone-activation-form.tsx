"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type RestaurantOption = {
  id: string;
  name: string;
  city: string;
  onboardingStatus: string;
};

type FormState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

export function PhoneActivationForm() {
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [provider, setProvider] = useState("LiveKit SIP");
  const [sipTrunkId, setSipTrunkId] = useState("");
  const [state, setState] = useState<FormState>({
    status: "idle",
    message: "Speichere die Restaurantnummer und verknuepfe sie mit einem SIP-Trunk."
  });

  useEffect(() => {
    let isMounted = true;

    async function loadRestaurants() {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/restaurants`);

        if (!response.ok) {
          if (isMounted) {
            setState({
              status: "error",
              message: "Restaurants konnten nicht geladen werden. Bitte API und Datenbank starten."
            });
          }
          return;
        }

        const payload = (await response.json()) as RestaurantOption[];

        if (isMounted) {
          setRestaurants(payload);

          if (payload.length > 0) {
            setRestaurantId(payload[0].id);
          }
        }
      } catch {
        if (isMounted) {
          setState({
            status: "error",
            message: "API nicht erreichbar. Starte die API mit npm run dev -w @restaurant-ai/api."
          });
        }
      }
    }

    void loadRestaurants();

    return () => {
      isMounted = false;
    };
  }, []);

  async function activatePhone() {
    setState({
      status: "loading",
      message: "Telefonnummer wird aktiviert..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/phone-numbers/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantId,
          phoneNumber,
          provider,
          sipTrunkId,
          setActive: true
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (payload?.error === "validation_error") {
          setState({
            status: "error",
            message: "Bitte pruefe Restaurant, Telefonnummer im Format +49301234567 und SIP-Trunk-ID."
          });
          return;
        }

        if (payload?.error === "restaurant_not_found") {
          setState({
            status: "error",
            message: "Restaurant wurde nicht gefunden. Bitte ein gueltiges Restaurant auswaehlen."
          });
          return;
        }

        if (payload?.error === "database_not_configured") {
          setState({
            status: "error",
            message: "Datenbank ist noch nicht verbunden. Bitte .env anlegen und Postgres starten."
          });
          return;
        }

        setState({
          status: "error",
          message: payload?.message ?? "Telefonnummer konnte nicht aktiviert werden."
        });
        return;
      }

      setState({
        status: "success",
        message: `${payload.e164} ist aktiv fuer ${payload.provider}.`
      });
    } catch {
      setState({
        status: "error",
        message: "API nicht erreichbar. Starte die API mit npm run dev -w @restaurant-ai/api."
      });
    }
  }

  const isMissingRequiredFields =
    restaurantId.trim().length === 0 ||
    phoneNumber.trim().length === 0 ||
    provider.trim().length === 0 ||
    sipTrunkId.trim().length === 0;

  return (
    <form className="form-card" onSubmit={(event) => event.preventDefault()}>
      <div>
        <h2>Telefon aktivieren</h2>
        <p className="muted">
          Verbinde eine Restaurantnummer mit dem SIP-Trunk, der spaeter eingehende Anrufe an den KI-Agenten routet.
        </p>
      </div>

      <div className="form-grid">
        <label className="form-field">
          <span>Restaurant</span>
          <select onChange={(event) => setRestaurantId(event.target.value)} value={restaurantId}>
            {restaurants.length === 0 ? (
              <option value="">Kein Restaurant geladen</option>
            ) : (
              restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name} · {restaurant.city}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="form-field">
          <span>Telefonnummer</span>
          <input
            inputMode="tel"
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+49301234567"
            type="tel"
            value={phoneNumber}
          />
        </label>

        <label className="form-field">
          <span>SIP Provider</span>
          <select onChange={(event) => setProvider(event.target.value)} value={provider}>
            <option>LiveKit SIP</option>
            <option>Twilio</option>
            <option>Telnyx</option>
            <option>Sipgate</option>
            <option>Placetel</option>
            <option>Other</option>
          </select>
        </label>

        <label className="form-field">
          <span>SIP Trunk ID</span>
          <input
            onChange={(event) => setSipTrunkId(event.target.value)}
            placeholder="ST_xxxxxxxxx"
            value={sipTrunkId}
          />
        </label>
      </div>

      <div className="form-actions">
        <button
          className="button"
          disabled={state.status === "loading" || isMissingRequiredFields}
          onClick={activatePhone}
          type="button"
        >
          Telefonnummer aktivieren
        </button>
        <span className={`form-message ${state.status}`}>{state.message}</span>
      </div>
    </form>
  );
}
