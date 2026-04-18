"use client";

import { useEffect, useState } from "react";
import { fetchJson, formatMoney, type RestaurantDetail } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type ActionState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

export function MenuBuilder() {
  const { restaurantId } = useSelectedRestaurant();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [menuName, setMenuName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [state, setState] = useState<ActionState>({
    status: "idle",
    message: "Lege mindestens ein Menue, eine Kategorie und die ersten Artikel an."
  });

  useEffect(() => {
    let active = true;

    async function load() {
      if (!restaurantId) {
        setRestaurant(null);
        return;
      }

      try {
        const payload = await fetchJson<RestaurantDetail>(`/v1/restaurants/${restaurantId}`);

        if (!active) {
          return;
        }

        setRestaurant(payload);
        setSelectedMenuId((current) => current || payload.menus[0]?.id || "");
        setSelectedCategoryId((current) => current || payload.menus[0]?.categories[0]?.id || "");
      } catch (error) {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Menuedaten konnten nicht geladen werden."
          });
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [restaurantId]);

  async function refresh() {
    if (!restaurantId) {
      return;
    }

    const payload = await fetchJson<RestaurantDetail>(`/v1/restaurants/${restaurantId}`);
    setRestaurant(payload);
    setSelectedMenuId(payload.menus.find((menu) => menu.id === selectedMenuId)?.id ?? payload.menus[0]?.id ?? "");

    const allCategories = payload.menus.flatMap((menu) => menu.categories);
    setSelectedCategoryId(allCategories.find((category) => category.id === selectedCategoryId)?.id ?? allCategories[0]?.id ?? "");
  }

  async function createMenu() {
    if (!restaurantId || !menuName.trim()) {
      return;
    }

    setState({
      status: "loading",
      message: "Menue wird angelegt..."
    });

    try {
      const menu = await fetchJson<{ id: string }>(`/v1/restaurants/${restaurantId}/menus`, {
        method: "POST",
        body: JSON.stringify({
          name: menuName,
          isActive: true
        })
      });

      setMenuName("");
      setSelectedMenuId(menu.id);
      await refresh();
      setState({
        status: "success",
        message: "Menue angelegt. Jetzt Kategorie und Artikel ergaenzen."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Menue konnte nicht angelegt werden."
      });
    }
  }

  async function createCategory() {
    if (!selectedMenuId || !categoryName.trim()) {
      return;
    }

    setState({
      status: "loading",
      message: "Kategorie wird angelegt..."
    });

    try {
      const category = await fetchJson<{ id: string }>(`/v1/menus/${selectedMenuId}/categories`, {
        method: "POST",
        body: JSON.stringify({
          name: categoryName,
          sortOrder: 0
        })
      });

      setCategoryName("");
      setSelectedCategoryId(category.id);
      await refresh();
      setState({
        status: "success",
        message: "Kategorie angelegt. Jetzt ersten Artikel ergaenzen."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Kategorie konnte nicht angelegt werden."
      });
    }
  }

  async function createItem() {
    if (!selectedCategoryId || !itemName.trim() || !itemPrice.trim()) {
      return;
    }

    setState({
      status: "loading",
      message: "Artikel wird angelegt..."
    });

    try {
      await fetchJson(`/v1/menu-categories/${selectedCategoryId}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: itemName,
          description: itemDescription || undefined,
          priceCents: Math.round(Number(itemPrice.replace(",", ".")) * 100),
          currency: "EUR",
          isAvailable: true,
          options: []
        })
      });

      setItemName("");
      setItemPrice("");
      setItemDescription("");
      await refresh();
      setState({
        status: "success",
        message: "Artikel angelegt."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Artikel konnte nicht angelegt werden."
      });
    }
  }

  if (!restaurantId) {
    return (
      <section className="card">
        <h2>Speisekarten</h2>
        <p className="muted">Lege zuerst im Onboarding ein Restaurant an.</p>
      </section>
    );
  }

  const selectedMenu = restaurant?.menus.find((menu) => menu.id === selectedMenuId) ?? restaurant?.menus[0];
  const allCategories = restaurant?.menus.flatMap((menu) => menu.categories) ?? [];

  return (
    <div className="grid content-grid">
      <section className="form-card">
        <div>
          <h2>Speisekarte aufbauen</h2>
          <p className="muted">Ohne strukturierte Menuedaten kann der Agent keine verlaesslichen Preise und Optionen nennen.</p>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Neues Menue</span>
            <input value={menuName} onChange={(event) => setMenuName(event.target.value)} placeholder="Hauptmenue" />
          </label>
          <label className="form-field">
            <span>Aktives Menue</span>
            <select value={selectedMenuId} onChange={(event) => setSelectedMenuId(event.target.value)}>
              <option value="">Menue waehlen</option>
              {restaurant?.menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Neue Kategorie</span>
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Doener"
            />
          </label>
          <label className="form-field">
            <span>Zielmenue</span>
            <select value={selectedMenuId} onChange={(event) => setSelectedMenuId(event.target.value)}>
              <option value="">Menue waehlen</option>
              {restaurant?.menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Kategorie fuer Artikel</span>
            <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
              <option value="">Kategorie waehlen</option>
              {allCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Artikelname</span>
            <input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Doener Teller" />
          </label>
          <label className="form-field">
            <span>Preis in EUR</span>
            <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} placeholder="9.50" />
          </label>
          <label className="form-field">
            <span>Beschreibung</span>
            <input
              value={itemDescription}
              onChange={(event) => setItemDescription(event.target.value)}
              placeholder="mit Salat und Sauce"
            />
          </label>
        </div>

        <div className="button-row">
          <button className="button" onClick={createMenu} type="button" disabled={!restaurantId || !menuName.trim()}>
            Menue anlegen
          </button>
          <button className="button button-secondary" onClick={createCategory} type="button" disabled={!selectedMenuId || !categoryName.trim()}>
            Kategorie anlegen
          </button>
          <button
            className="button button-secondary"
            onClick={createItem}
            type="button"
            disabled={!selectedCategoryId || !itemName.trim() || !itemPrice.trim()}
          >
            Artikel anlegen
          </button>
        </div>

        <span className={`form-message ${state.status}`}>{state.message}</span>
      </section>

      <section className="card stack-md">
        <h2>Aktuelles Menue</h2>
        {!selectedMenu ? (
          <div className="empty-state">Noch kein Menue vorhanden.</div>
        ) : (
          selectedMenu.categories.map((category) => (
            <div className="card inset-card" key={category.id}>
              <h3>{category.name}</h3>
              {category.items.length === 0 ? (
                <div className="muted">Noch keine Artikel in dieser Kategorie.</div>
              ) : (
                category.items.map((item) => (
                  <div className="order-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <div className="muted">{item.description ?? "Ohne Beschreibung"}</div>
                    </div>
                    <span className="pill">{formatMoney(item.priceCents, item.currency)}</span>
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
