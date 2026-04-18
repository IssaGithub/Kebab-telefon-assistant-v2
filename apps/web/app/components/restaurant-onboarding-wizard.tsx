"use client";

import { useEffect, useState } from "react";
import { fetchJson, type DashboardSummary, type RestaurantSummary } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type WizardState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

type Props = {
  compact?: boolean;
  publicMode?: boolean;
};

const initialForm = {
  tenantName: "",
  tenantSlug: "",
  ownerEmail: "",
  ownerName: "",
  password: "",
  restaurantName: "",
  phone: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  countryCode: "DE"
};

export function RestaurantOnboardingWizard({ compact = false, publicMode = false }: Props) {
  const [form, setForm] = useState(initialForm);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [state, setState] = useState<WizardState>({
    status: "idle",
    message: "Lege zuerst deinen Tenant, Inhaber und den ersten Restaurantstandort an."
  });
  const { restaurantId, setRestaurantId } = useSelectedRestaurant();

  useEffect(() => {
    let active = true;

    async function load() {
      if (publicMode) {
        return;
      }

      try {
        const [restaurantsPayload, summaryPayload] = await Promise.all([
          fetchJson<RestaurantSummary[]>("/v1/restaurants"),
          fetchJson<DashboardSummary>("/v1/dashboard/summary")
        ]);

        if (!active) {
          return;
        }

        setRestaurants(restaurantsPayload);
        setSummary(summaryPayload);

        if (!restaurantId && restaurantsPayload[0]) {
          setRestaurantId(restaurantsPayload[0].id);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Setup-Daten konnten nicht geladen werden."
        });
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [publicMode, restaurantId, setRestaurantId]);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "tenantName" && current.tenantSlug.trim().length === 0
        ? {
            tenantSlug: slugify(value)
          }
        : {})
    }));
  }

  async function submit() {
    setState({
      status: "loading",
      message: "Tenant und Restaurant werden angelegt..."
    });

    try {
      const payload = await fetchJson<{
        tenant: { id: string; slug: string };
        restaurant: { id: string; name: string };
      }>("/v1/onboarding", {
        method: "POST",
        body: JSON.stringify({
          tenant: {
            name: form.tenantName,
            slug: form.tenantSlug
          },
          owner: {
            email: form.ownerEmail,
            name: form.ownerName,
            password: form.password
          },
          restaurant: {
            name: form.restaurantName,
            phone: form.phone || undefined,
            addressLine1: form.addressLine1,
            postalCode: form.postalCode,
            city: form.city,
            countryCode: form.countryCode
          }
        })
      });

      setRestaurantId(payload.restaurant.id);
      setForm(initialForm);
      setState({
        status: "success",
        message: `${payload.restaurant.name} wurde angelegt. Als Naechstes Speisekarte und Telefonnummer vervollstaendigen.`
      });

      if (publicMode) {
        window.location.href = "/";
        return;
      }

      const refreshedRestaurants = await fetchJson<RestaurantSummary[]>("/v1/restaurants");
      setRestaurants(refreshedRestaurants);
      const refreshedSummary = await fetchJson<DashboardSummary>("/v1/dashboard/summary");
      setSummary(refreshedSummary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onboarding konnte nicht gestartet werden.";
      setState({
        status: "error",
        message
      });
    }
  }

  const progressRows = [
    {
      label: "Tenant und Restaurant angelegt",
      done: restaurants.length > 0,
      hint: "Basisdaten, Inhaber und erster Standort"
    },
    {
      label: "Speisekarte hinterlegt",
      done: restaurants.some((restaurant) => (restaurant._count?.menus ?? 0) > 0),
      hint: "Mindestens ein Menue fuer den Agenten"
    },
    {
      label: "Telefonnummer aktiviert",
      done: restaurants.some((restaurant) => restaurant.onboardingStatus === "phone_connected" || restaurant.phone),
      hint: "SIP-Nummer und Trunk verknuepfen"
    }
  ];

  const isInvalid = Object.values({
    tenantName: form.tenantName,
    tenantSlug: form.tenantSlug,
    ownerEmail: form.ownerEmail,
    password: form.password,
    restaurantName: form.restaurantName,
    addressLine1: form.addressLine1,
    postalCode: form.postalCode,
    city: form.city
  }).some((value) => value.trim().length === 0);

  return (
    <section className="card stack-lg">
      <div className="page-header" style={{ marginBottom: compact ? 0 : 20 }}>
        <div>
          <div className="eyebrow">Self-Service Setup</div>
          <h2>{compact ? "Neuen Tenant anlegen" : publicMode ? "Account erstellen und Restaurant einrichten" : "Produkt bestellen und sofort konfigurieren"}</h2>
          <p className="muted">
            Dieser Flow legt Tenant, Restaurant und Inhaber an. Danach koennen Menue, Telefonnummer und Testanruf
            direkt im Dashboard ergaenzt werden.
          </p>
        </div>
        {!publicMode && summary ? (
          <div className="metrics-inline">
            <div>
              <strong>{summary.restaurants}</strong>
              <span>Restaurants</span>
            </div>
            <div>
              <strong>{summary.callsToday}</strong>
              <span>Anrufe heute</span>
            </div>
            <div>
              <strong>{summary.openOrders}</strong>
              <span>offene Orders</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className={compact ? "grid compact-grid" : "grid content-grid"}>
        <div className="form-card">
          <div className="form-grid">
            <label className="form-field">
              <span>Tenant-Name</span>
              <input value={form.tenantName} onChange={(event) => updateField("tenantName", event.target.value)} />
            </label>
            <label className="form-field">
              <span>Tenant-Slug</span>
              <input
                value={form.tenantSlug}
                onChange={(event) => updateField("tenantSlug", slugify(event.target.value))}
                placeholder="demo-restaurant"
              />
            </label>
            <label className="form-field">
              <span>Inhaber E-Mail</span>
              <input
                type="email"
                value={form.ownerEmail}
                onChange={(event) => updateField("ownerEmail", event.target.value)}
                placeholder="owner@example.com"
              />
            </label>
            <label className="form-field">
              <span>Inhaber Name</span>
              <input value={form.ownerName} onChange={(event) => updateField("ownerName", event.target.value)} />
            </label>
            <label className="form-field">
              <span>Passwort</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="Mindestens 8 Zeichen"
              />
            </label>
            <label className="form-field">
              <span>Restaurantname</span>
              <input
                value={form.restaurantName}
                onChange={(event) => updateField("restaurantName", event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Telefonnummer</span>
              <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
            </label>
            <label className="form-field">
              <span>Adresse</span>
              <input
                value={form.addressLine1}
                onChange={(event) => updateField("addressLine1", event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>PLZ</span>
              <input value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} />
            </label>
            <label className="form-field">
              <span>Stadt</span>
              <input value={form.city} onChange={(event) => updateField("city", event.target.value)} />
            </label>
            <label className="form-field">
              <span>Land</span>
              <input
                value={form.countryCode}
                maxLength={2}
                onChange={(event) => updateField("countryCode", event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="button" type="button" disabled={isInvalid || state.status === "loading"} onClick={submit}>
              Tenant anlegen
            </button>
            <span className={`form-message ${state.status}`}>{state.message}</span>
          </div>
        </div>

        <div className="card tone-subtle">
          <h3>Setup-Fortschritt</h3>
          <div className="status-list">
            {progressRows.map((row) => (
              <div className="status-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <div className="muted">{row.hint}</div>
                </div>
                <span className={row.done ? "pill" : "pill warning"}>{row.done ? "Erledigt" : "Offen"}</span>
              </div>
            ))}
          </div>

          {publicMode ? (
            <p className="muted">
              Nach dem Absenden wird automatisch eine Sitzung erstellt und du landest direkt im geschuetzten Dashboard.
            </p>
          ) : (
            <>
              <h3 style={{ marginTop: 22 }}>Bereits angelegte Restaurants</h3>
              <div className="status-list">
                {restaurants.length === 0 ? (
                  <div className="empty-state">Noch kein Restaurant angelegt.</div>
                ) : (
                  restaurants.map((restaurant) => (
                    <button
                      className={`selection-row ${restaurant.id === restaurantId ? "active" : ""}`}
                      key={restaurant.id}
                      onClick={() => setRestaurantId(restaurant.id)}
                      type="button"
                    >
                      <div>
                        <strong>{restaurant.name}</strong>
                        <div className="muted">
                          {restaurant.city} - {restaurant.tenant?.slug ?? "tenant"}
                        </div>
                      </div>
                      <span className={restaurant.onboardingStatus === "phone_connected" ? "pill" : "pill warning"}>
                        {restaurant.onboardingStatus}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
