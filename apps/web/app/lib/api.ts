export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type RestaurantSummary = {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  phone: string | null;
  onboardingStatus: string;
  createdAt: string;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  _count?: {
    menus: number;
    orders: number;
    calls: number;
  };
};

export type RestaurantDetail = RestaurantSummary & {
  addressLine1: string;
  postalCode: string;
  countryCode: string;
  phoneNumbers: Array<{
    id: string;
    e164: string;
    provider: string;
    sipTrunkId: string | null;
    isActive: boolean;
  }>;
  menus: Array<{
    id: string;
    name: string;
    isActive: boolean;
    categories: Array<{
      id: string;
      name: string;
      sortOrder: number;
      items: Array<{
        id: string;
        name: string;
        description: string | null;
        priceCents: number;
        currency: string;
        isAvailable: boolean;
        options: Array<{
          id: string;
          name: string;
          priceDeltaCents: number;
          isAvailable: boolean;
        }>;
      }>;
    }>;
  }>;
  calls: Array<{
    id: string;
    callerNumber: string | null;
    status: string;
    direction: string;
    startedAt: string;
  }>;
  orders: Array<{
    id: string;
    customerName: string | null;
    customerPhone: string | null;
    status: string;
    totalCents: number;
    currency: string;
    createdAt: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
    }>;
  }>;
};

export type DashboardSummary = {
  restaurants: number;
  openOrders: number;
  callsToday: number;
};

export type OrderRecord = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
};

export type CallRecord = {
  id: string;
  callerNumber: string | null;
  status: string;
  direction: string;
  startedAt: string;
  endedAt: string | null;
};

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string; message?: string } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

export function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
