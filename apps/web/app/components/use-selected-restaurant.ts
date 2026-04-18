"use client";

import { useEffect, useState } from "react";

const storageKey = "restaurant-ai:selected-restaurant-id";

export function useSelectedRestaurant() {
  const [restaurantId, setRestaurantIdState] = useState("");

  useEffect(() => {
    const current = window.localStorage.getItem(storageKey);

    if (current) {
      setRestaurantIdState(current);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setRestaurantIdState(event.newValue ?? "");
      }
    }

    function handleSelection(event: Event) {
      const customEvent = event as CustomEvent<string>;
      setRestaurantIdState(customEvent.detail ?? "");
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("restaurant-selection-change", handleSelection as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("restaurant-selection-change", handleSelection as EventListener);
    };
  }, []);

  function setRestaurantId(nextRestaurantId: string) {
    window.localStorage.setItem(storageKey, nextRestaurantId);
    setRestaurantIdState(nextRestaurantId);
    window.dispatchEvent(new CustomEvent("restaurant-selection-change", { detail: nextRestaurantId }));
  }

  return {
    restaurantId,
    setRestaurantId
  };
}
