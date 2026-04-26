"use client";

import { useEffect, useState } from "react";
import { fetchJson, type RestaurantSummary } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type FormState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

export function PhoneActivationForm() {
  const { restaurantId, setRestaurantId } = useSelectedRestaurant();
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
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
        const payload = await fetchJson<RestaurantSummary[]>("/v1/restaurants");

        if (isMounted) {
          setRestaurants(payload);

          if (!restaurantId && payload.length > 0) {
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
  }, [restaurantId, setRestaurantId]);

  async function activatePhone() {
    setState({
      status: "loading",
      message: "Telefonnummer wird aktiviert..."
    });

    try {
      const payload = await fetchJson<{ e164: string; provider: string; livekitDispatchRuleId?: string | null }>(
        "/v1/phone-numbers/activate",
        {
        method: "POST",
        body: JSON.stringify({
          restaurantId,
          phoneNumber,
          provider,
          sipTrunkId,
          setActive: true
        })
        }
      );

      setState({
        status: "success",
        message: payload.livekitDispatchRuleId
          ? `${payload.e164} ist aktiv fuer ${payload.provider}. Inbound-Routing wurde mit LiveKit synchronisiert.`
          : `${payload.e164} ist aktiv fuer ${payload.provider}.`
      });
    } catch {
      setState({
        status: "error",
        message: "Telefonnummer konnte nicht aktiviert werden. Bitte Format, SIP-Trunk-ID und API pruefen."
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
                  {restaurant.name} - {restaurant.city}
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
