function resolveApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }

  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
}

export const apiBaseUrl = resolveApiBaseUrl();

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
    livekitDispatchRuleId: string | null;
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
  callId?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  fulfillmentType?: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  call?: {
    id: string;
    status: string;
    callerNumber: string | null;
    livekitRoom: string | null;
    startedAt: string;
    endedAt: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  events?: Array<{
    id: string;
    status: string;
    note: string | null;
    createdAt: string;
  }>;
};

export type CallRecord = {
  id: string;
  callerNumber: string | null;
  livekitRoom?: string | null;
  status: string;
  direction: string;
  startedAt: string;
  endedAt: string | null;
  transcriptText?: string | null;
};

export type DemoCallSession = {
  callId: string;
  orderId: string;
  assistantMessage: string;
  messages: Array<{
    role: "assistant" | "caller";
    text: string;
  }>;
  order: {
    id: string;
    status: string;
    fulfillmentType: string;
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    currency: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      totalCents: number;
    }>;
  };
};

export type UsageSummary = {
  scope: {
    tenantId: string;
    tenantName: string | null;
  };
  tracked: {
    exactProviderUsage: boolean;
    notes: string[];
  };
  totals: {
    restaurants: number;
    orders: number;
    calls: number;
    livekitRooms: number;
    callMinutes: number;
    transcriptChars: number;
  };
  tokens: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    budgetTotal: number | null;
    budgetInput: number | null;
    budgetOutput: number | null;
    remainingTotal: number | null;
    remainingInput: number | null;
    remainingOutput: number | null;
  };
  costs: {
    livekitCents: number | null;
    sttCents: number | null;
    ttsCents: number | null;
    llmInputCents: number | null;
    llmOutputCents: number | null;
    totalKnownCents: number | null;
  };
  pricingConfig: {
    livekitCostPerMinute: number | null;
    sttCostPerMinute: number | null;
    ttsCostPer1kChars: number | null;
    llmInputCostPer1mTokens: number | null;
    llmOutputCostPer1mTokens: number | null;
  };
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
