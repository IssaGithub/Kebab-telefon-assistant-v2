import { prisma } from "@restaurant-ai/db";

type RestaurantContext = Awaited<ReturnType<typeof loadRestaurantContext>>;

type SummaryItem = {
  id: string;
  name: string;
  quantity: number;
  totalCents: number;
};

type DemoCallResponse = {
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
    items: SummaryItem[];
  };
};

const germanQuantities: Record<string, number> = {
  ein: 1,
  eins: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fuenf: 5,
  funf: 5,
  sechs: 6
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendTranscript(existing: string | null | undefined, role: "assistant" | "caller", text: string) {
  const line = `${role === "assistant" ? "Agent" : "Caller"}: ${text.trim()}`;
  return existing ? `${existing}\n${line}` : line;
}

function transcriptToMessages(transcriptText: string | null | undefined) {
  if (!transcriptText) {
    return [] as DemoCallResponse["messages"];
  }

  return transcriptText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("Agent: ")) {
        return {
          role: "assistant" as const,
          text: line.slice("Agent: ".length)
        };
      }

      return {
        role: "caller" as const,
        text: line.startsWith("Caller: ") ? line.slice("Caller: ".length) : line
      };
    });
}

async function loadRestaurantContext(restaurantId: string) {
  return prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      agentConfig: true,
      deliveryZones: true,
      menus: {
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                where: { isAvailable: true },
                include: {
                  options: {
                    where: { isAvailable: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

function extractQuantity(message: string, itemName: string) {
  const normalizedMessage = normalize(message);
  const normalizedName = normalize(itemName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const numericMatch = normalizedMessage.match(new RegExp(`(\\d+)\\s*(x\\s*)?${normalizedName}`));
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  for (const [word, quantity] of Object.entries(germanQuantities)) {
    if (normalizedMessage.match(new RegExp(`\\b${word}\\b\\s+${normalizedName}`))) {
      return quantity;
    }
  }

  return 1;
}

function findRequestedItems(message: string, restaurant: NonNullable<RestaurantContext>) {
  const normalizedMessage = normalize(message);
  const availableItems = restaurant.menus.flatMap((menu) =>
    menu.categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })))
  );

  const matches = availableItems.filter((item) => {
    const normalizedName = normalize(item.name);
    if (normalizedName.length < 2) {
      return false;
    }

    return normalizedMessage.includes(normalizedName);
  });

  const dedupedMatches = matches
    .sort((left, right) => normalize(right.name).length - normalize(left.name).length)
    .filter((candidate, index, all) => {
      const candidateName = normalize(candidate.name);

      return !all.slice(0, index).some((selected) => normalize(selected.name).includes(candidateName));
    });

  return dedupedMatches.map((item) => ({
    menuItemId: item.id,
    name: item.name,
    quantity: extractQuantity(message, item.name),
    unitCents: item.priceCents
  }));
}

async function applyRequestedItems(orderId: string, requestedItems: ReturnType<typeof findRequestedItems>) {
  for (const requestedItem of requestedItems) {
    const existing = await prisma.orderItem.findFirst({
      where: {
        orderId,
        menuItemId: requestedItem.menuItemId
      }
    });

    if (existing) {
      const quantity = existing.quantity + requestedItem.quantity;

      await prisma.orderItem.update({
        where: { id: existing.id },
        data: {
          quantity,
          totalCents: quantity * existing.unitCents
        }
      });
      continue;
    }

    await prisma.orderItem.create({
      data: {
        orderId,
        menuItemId: requestedItem.menuItemId,
        name: requestedItem.name,
        quantity: requestedItem.quantity,
        unitCents: requestedItem.unitCents,
        totalCents: requestedItem.quantity * requestedItem.unitCents
      }
    });
  }
}

function detectFulfillment(message: string) {
  const normalizedMessage = normalize(message);

  if (/\b(lieferung|liefern|zustellen|delivery)\b/.test(normalizedMessage)) {
    return "delivery" as const;
  }

  if (/\b(abholen|abholung|selbstabholung|pickup)\b/.test(normalizedMessage)) {
    return "pickup" as const;
  }

  return null;
}

function detectName(message: string) {
  const match = message.match(/(?:ich bin|mein name ist|name)\s+([A-Za-zÄÖÜäöüß\-\s]{2,60})/i);
  return match?.[1]?.trim() ?? null;
}

function detectAddress(message: string) {
  const match = message.match(/(?:adresse|lieferadresse|anschrift|wohne in)\s+(.+)/i);
  return match?.[1]?.trim() ?? null;
}

function detectPhone(message: string) {
  const match = message.match(/(\+?\d[\d\s/-]{6,}\d)/);
  if (!match) {
    return null;
  }

  const compact = match[1].replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) {
    return compact;
  }

  return compact.length >= 7 ? compact : null;
}

function isFinalizeIntent(message: string) {
  const normalizedMessage = normalize(message);
  return [
    "das wars",
    "das war alles",
    "mehr nicht",
    "fertig",
    "abschliessen",
    "abschliessen bitte",
    "bestellen",
    "so passt es"
  ].some((phrase) => normalizedMessage.includes(phrase));
}

function isMenuQuestion(message: string) {
  const normalizedMessage = normalize(message);
  return ["was habt ihr", "welche", "speisekarte", "menue", "menu", "empfiehl"].some((phrase) =>
    normalizedMessage.includes(phrase)
  );
}

async function recalculateOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const subtotalCents = order.items.reduce((sum, item) => sum + item.totalCents, 0);
  const deliveryFeeCents = order.fulfillmentType === "delivery" ? order.deliveryFeeCents : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      subtotalCents,
      deliveryFeeCents,
      totalCents
    },
    include: {
      items: true
    }
  });
}

async function buildResponse(callId: string, orderId: string, assistantMessage: string): Promise<DemoCallResponse> {
  const [call, order] = await Promise.all([
    prisma.call.findUnique({
      where: { id: callId }
    }),
    prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })
  ]);

  if (!call || !order) {
    throw new Error("Demo call state not found");
  }

  return {
    callId,
    orderId,
    assistantMessage,
    messages: transcriptToMessages(call.transcriptText),
    order: {
      id: order.id,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      currency: order.currency,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        totalCents: item.totalCents
      }))
    }
  };
}

export async function startDemoOrderCall(restaurantId: string, callerNumber?: string) {
  const restaurant = await loadRestaurantContext(restaurantId);

  if (!restaurant) {
    throw Object.assign(new Error("Restaurant not found"), {
      code: "restaurant_not_found"
    });
  }

  const greeting =
    restaurant.agentConfig?.greeting ??
    `Guten Tag, hier ist der KI-Bestellassistent von ${restaurant.name}. Was moechten Sie bestellen?`;

  const [call, order] = await prisma.$transaction(async (tx) => {
    const createdCall = await tx.call.create({
      data: {
        restaurantId,
        callerNumber: callerNumber ?? "+491701234567",
        direction: "inbound",
        status: "active",
        transcriptText: appendTranscript(null, "assistant", greeting)
      }
    });

    const createdOrder = await tx.order.create({
      data: {
        restaurantId,
        callId: createdCall.id,
        customerPhone: callerNumber ?? null,
        fulfillmentType: "pickup",
        status: "draft",
        currency: "EUR"
      }
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: createdOrder.id,
        status: "draft",
        note: "Demo-Bestellgespraech gestartet"
      }
    });

    return [createdCall, createdOrder] as const;
  });

  return buildResponse(call.id, order.id, greeting);
}

export async function continueDemoOrderCall(callId: string, callerMessage: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      restaurant: {
        include: {
          agentConfig: true,
          deliveryZones: true,
          menus: {
            orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
            include: {
              categories: {
                orderBy: { sortOrder: "asc" },
                include: {
                  items: {
                    where: { isAvailable: true },
                    include: {
                      options: {
                        where: { isAvailable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { items: true }
      }
    }
  });

  if (!call) {
    throw Object.assign(new Error("Demo call not found"), {
      code: "demo_call_not_found"
    });
  }

  const order = call.orders[0];

  if (!order) {
    throw new Error("Demo call has no order");
  }

  const message = callerMessage.trim();
  let assistantMessage = "";
  let transcriptText = appendTranscript(call.transcriptText, "caller", message);

  const requestedItems = findRequestedItems(message, call.restaurant);
  if (requestedItems.length > 0) {
    await applyRequestedItems(order.id, requestedItems);
    await recalculateOrder(order.id);
  }

  const fulfillmentType = detectFulfillment(message);
  const customerName = detectName(message);
  const customerPhone = detectPhone(message);
  const deliveryAddress = detectAddress(message);

  const nextOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      fulfillmentType: fulfillmentType ?? undefined,
      customerName: customerName ?? undefined,
      customerPhone: customerPhone ?? undefined,
      deliveryAddress: deliveryAddress ?? undefined,
      deliveryFeeCents: fulfillmentType === "delivery" ? 250 : fulfillmentType === "pickup" ? 0 : undefined
    },
    include: {
      items: true
    }
  });

  const refreshedOrder = await recalculateOrder(nextOrder.id);

  if (isFinalizeIntent(message)) {
    if (refreshedOrder.items.length === 0) {
      assistantMessage = "Ich habe noch keinen Artikel in der Bestellung. Nenne mir bitte zuerst ein Gericht aus der Speisekarte.";
    } else if (!refreshedOrder.customerName) {
      assistantMessage = "Wie lautet der Name fuer die Bestellung?";
    } else if (refreshedOrder.fulfillmentType === "delivery" && !refreshedOrder.deliveryAddress) {
      assistantMessage = "Bitte nenne mir noch die Lieferadresse, damit ich die Bestellung abschliessen kann.";
    } else {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: refreshedOrder.id },
          data: {
            status: "pending_restaurant"
          }
        }),
        prisma.orderStatusEvent.create({
          data: {
            orderId: refreshedOrder.id,
            status: "pending_restaurant",
            note: "Demo-Bestellung wurde vom KI-Agenten abgeschlossen"
          }
        }),
        prisma.call.update({
          where: { id: call.id },
          data: {
            status: "completed",
            endedAt: new Date()
          }
        })
      ]);

      assistantMessage = `Perfekt. Ich habe ${refreshedOrder.items.length} Positionen aufgenommen und die Bestellung fuer ${refreshedOrder.customerName} im Dashboard gespeichert.`;
    }
  } else if (requestedItems.length > 0) {
    const itemsSummary = requestedItems.map((item) => `${item.quantity}x ${item.name}`).join(", ");
    assistantMessage =
      refreshedOrder.fulfillmentType === "delivery"
        ? `Verstanden, ich habe ${itemsSummary} notiert. Bitte nenne mir noch Namen, Telefonnummer und Lieferadresse.`
        : `Verstanden, ich habe ${itemsSummary} notiert. Moechtest du abholen oder liefern lassen?`;
  } else if (isMenuQuestion(message)) {
    const suggestedItems = call.restaurant.menus
      .flatMap((menu) => menu.categories.flatMap((category) => category.items))
      .slice(0, 4)
      .map((item) => item.name);
    assistantMessage = suggestedItems.length
      ? `Aktuell verfuegbar sind zum Beispiel ${suggestedItems.join(", ")}. Was darf ich fuer dich aufnehmen?`
      : "Es ist noch keine Speisekarte hinterlegt. Bitte lege zuerst Menueartikel im Dashboard an.";
  } else if (!refreshedOrder.customerName && refreshedOrder.items.length > 0) {
    assistantMessage = "Wie lautet der Name fuer die Bestellung?";
  } else if (refreshedOrder.fulfillmentType === "delivery" && !refreshedOrder.deliveryAddress) {
    assistantMessage = "Danke. Bitte nenne mir jetzt noch die Lieferadresse.";
  } else if (!refreshedOrder.customerPhone && refreshedOrder.items.length > 0) {
    assistantMessage = "Unter welcher Telefonnummer kann das Restaurant dich bei Rueckfragen erreichen?";
  } else {
    assistantMessage = "Ich habe das verstanden. Wenn die Bestellung vollstaendig ist, sage einfach 'das war alles'.";
  }

  transcriptText = appendTranscript(transcriptText, "assistant", assistantMessage);

  await prisma.call.update({
    where: { id: call.id },
    data: {
      transcriptText
    }
  });

  return buildResponse(call.id, order.id, assistantMessage);
}
