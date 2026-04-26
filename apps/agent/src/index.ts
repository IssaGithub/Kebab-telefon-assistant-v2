import "./load-env.js";
import { fileURLToPath } from "node:url";
import {
  ServerOptions,
  cli,
  defineAgent,
  inference,
  llm,
  type JobContext,
  type JobProcess,
  voice
} from "@livekit/agents";
import { prisma } from "@restaurant-ai/db";
import * as silero from "@livekit/agents-plugin-silero";
import { RestaurantAgent } from "./restaurant-agent.js";
import { z } from "zod";

const requiredEnvironment = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET"
] as const;

function missingEnvironment() {
  return requiredEnvironment.filter((key) => !process.env[key]);
}

function parseMetadata(metadata: string | undefined) {
  if (!metadata) {
    return null;
  }

  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarizeMenu(
  restaurant: Awaited<ReturnType<typeof loadRestaurantContext>>
) {
  if (!restaurant) {
    return "Kein Restaurantkontext geladen.";
  }

  const lines = restaurant.menus.flatMap((menu) =>
    menu.categories.flatMap((category) =>
      category.items.map((item) => {
        const options = item.options.map((option) => option.name).join(", ");
        const optionText = options.length > 0 ? ` | Optionen/Zutaten: ${options}` : "";
        return `- ${item.name} (${(item.priceCents / 100).toFixed(2)} ${item.currency})${optionText}`;
      })
    )
  );

  return lines.length > 0 ? lines.join("\n") : "Keine aktiven Menueartikel vorhanden.";
}

function summarizeDelivery(
  restaurant: Awaited<ReturnType<typeof loadRestaurantContext>>
) {
  if (!restaurant || restaurant.deliveryZones.length === 0) {
    return "Keine Lieferzonen hinterlegt. Falls Lieferung gefragt wird, erst Adresse oder Postleitzahl abfragen.";
  }

  return restaurant.deliveryZones
    .map(
      (zone) =>
        `- Zone ${zone.name} (${zone.postalCodePattern}): Mindestbestellwert ${(zone.minimumOrderCents / 100).toFixed(2)} EUR, Liefergebuehr ${(zone.feeCents / 100).toFixed(2)} EUR`
    )
    .join("\n");
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
                orderBy: { name: "asc" },
                include: {
                  options: {
                    where: { isAvailable: true },
                    orderBy: { name: "asc" }
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

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function appendTranscript(existing: string, role: "assistant" | "caller", text: string) {
  const line = `${role === "assistant" ? "Agent" : "Caller"}: ${text.trim()}`;
  return existing.length > 0 ? `${existing}\n${line}` : line;
}

function describeAgentError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Unbekannter Agent-Fehler.";
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : null;

  if (message?.includes("QuotaStatusExceeded") || message?.includes("quota exceeded")) {
    if (message.includes("LLM token credit quota exceeded")) {
      return "OpenAI LLM ueber LiveKit Inference hat keine verfuegbare Quote mehr.";
    }

    if (message.includes("STT token credit quota exceeded")) {
      return "STT ueber LiveKit Inference hat keine verfuegbare Quote mehr.";
    }

    if (message.includes("TTS token credit quota exceeded")) {
      return "TTS ueber LiveKit Inference hat keine verfuegbare Quote mehr.";
    }

    return "LiveKit Inference Quote erschopft. Browser-Voice-Antwort konnte nicht erzeugt werden.";
  }

  if (message?.includes("Error connecting to LiveKit WebSocket")) {
    return "LiveKit Inference WebSocket konnte nicht aufgebaut werden.";
  }

  return message ?? "Unbekannter Agent-Fehler.";
}

function extractPostalCode(address: string | null | undefined) {
  if (!address) {
    return null;
  }

  return address.match(/\b\d{5}\b/)?.[0] ?? null;
}

function matchDeliveryZone(
  restaurant: NonNullable<Awaited<ReturnType<typeof loadRestaurantContext>>>,
  address: string | null | undefined
) {
  const postalCode = extractPostalCode(address);

  if (!postalCode) {
    return null;
  }

  return (
    restaurant.deliveryZones.find((zone) => {
      const pattern = zone.postalCodePattern.trim();

      if (pattern.includes("*")) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
        return regex.test(postalCode);
      }

      return postalCode.startsWith(pattern);
    }) ?? null
  );
}

function findMenuItemByName(
  restaurant: NonNullable<Awaited<ReturnType<typeof loadRestaurantContext>>>,
  requestedName: string
) {
  const normalizedRequested = normalize(requestedName);
  const items = restaurant.menus.flatMap((menu) => menu.categories.flatMap((category) => category.items));
  const exact = items.find((item) => normalize(item.name) === normalizedRequested);

  if (exact) {
    return exact;
  }

  return (
    items.find((item) => {
      const normalizedItem = normalize(item.name);
      return normalizedRequested.includes(normalizedItem) || normalizedItem.includes(normalizedRequested);
    }) ?? null
  );
}

function matchOptions(
  item: NonNullable<ReturnType<typeof findMenuItemByName>>,
  requestedOptions: string[] | undefined
) {
  if (!requestedOptions || requestedOptions.length === 0) {
    return {
      valid: [] as string[],
      invalid: [] as string[]
    };
  }

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const optionName of requestedOptions) {
    const normalizedRequested = normalize(optionName);
    const matchedOption =
      item.options.find((option) => normalize(option.name) === normalizedRequested) ??
      item.options.find((option) => {
        const normalizedOption = normalize(option.name);
        return normalizedRequested.includes(normalizedOption) || normalizedOption.includes(normalizedRequested);
      });

    if (matchedOption) {
      if (!valid.includes(matchedOption.name)) {
        valid.push(matchedOption.name);
      }
    } else {
      invalid.push(optionName);
    }
  }

  return { valid, invalid };
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
  const totalCents = subtotalCents + order.deliveryFeeCents;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      subtotalCents,
      totalCents
    },
    include: {
      items: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });
}

async function createVoiceOrderSession(
  restaurant: NonNullable<Awaited<ReturnType<typeof loadRestaurantContext>>>,
  roomName: string,
  callerIdentity: string | null,
  greeting: string
) {
  return prisma.$transaction(async (tx) => {
    const existingCall = await tx.call.findFirst({
      where: {
        restaurantId: restaurant.id,
        livekitRoom: roomName
      },
      include: {
        orders: {
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });

    const call =
      existingCall ??
      (await tx.call.create({
        data: {
          restaurantId: restaurant.id,
          livekitRoom: roomName,
          callerNumber: callerIdentity,
          direction: "inbound",
          status: "active",
          transcriptText: ""
        },
        include: {
          orders: {
            orderBy: { createdAt: "asc" },
            take: 1
          }
        }
      }));

    const nextCall = await tx.call.update({
      where: { id: call.id },
      data: {
        callerNumber: callerIdentity ?? call.callerNumber,
        status: "active"
      }
    });

    let order = call.orders[0] ?? null;

    if (!order) {
      order = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          callId: call.id,
          customerPhone: callerIdentity,
          fulfillmentType: "pickup",
          status: "draft",
          currency: "EUR"
        }
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          status: "draft",
          note: "Voice-Bestellgespraech gestartet"
        }
      });
    }

    return {
      callId: nextCall.id,
      orderId: order.id,
      transcriptText:
        call.transcriptText && call.transcriptText.trim().length > 0
          ? call.transcriptText
          : appendTranscript("", "assistant", greeting)
    };
  });
}

async function loadOrderSnapshot(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });
}

function buildOrderSummary(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderSnapshot>>>,
  restaurant: NonNullable<Awaited<ReturnType<typeof loadRestaurantContext>>>
) {
  const zone = order.fulfillmentType === "delivery" ? matchDeliveryZone(restaurant, order.deliveryAddress) : null;

  return {
    orderId: order.id,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    minimumOrderCents: zone?.minimumOrderCents ?? 0,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      totalCents: item.totalCents
    }))
  };
}

function createOrderTools(params: {
  restaurant: NonNullable<Awaited<ReturnType<typeof loadRestaurantContext>>>;
  orderId: string;
  callId: string;
}) {
  const addOrderItems = llm.tool({
    description: "Fuegt genau einen bestaetigten Artikel in den Warenkorb ein oder erhoeht eine vorhandene Position.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        quantityText: { type: "string" },
        optionsCsv: { type: "string" }
      },
      required: ["name", "quantityText", "optionsCsv"],
      additionalProperties: false
    },
    execute: async ({ name, quantityText, optionsCsv }: { name: string; quantityText: string; optionsCsv: string }) => {
      const warnings: string[] = [];
      const parsedQuantity = Number.parseInt(quantityText, 10);
      const safeQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
      const requestedOptions = optionsCsv
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const menuItem = findMenuItemByName(params.restaurant, name);

      if (!menuItem) {
        warnings.push(`Artikel nicht gefunden: ${name}`);
      } else {
        const optionMatch = matchOptions(menuItem, requestedOptions);
        if (optionMatch.invalid.length > 0) {
          warnings.push(`Unbekannte Optionen fuer ${menuItem.name}: ${optionMatch.invalid.join(", ")}`);
        }

        const note = optionMatch.valid.length > 0 ? optionMatch.valid.join(", ") : null;
        const unitCents =
          menuItem.priceCents + optionMatch.valid.reduce((sum, optionName) => {
            const option = menuItem.options.find((entry) => entry.name === optionName);
            return sum + (option?.priceDeltaCents ?? 0);
          }, 0);

        const existing = await prisma.orderItem.findFirst({
          where: {
            orderId: params.orderId,
            menuItemId: menuItem.id,
            notes: note
          }
        });

        if (existing) {
          const nextQuantity = existing.quantity + safeQuantity;
          await prisma.orderItem.update({
            where: { id: existing.id },
            data: {
              quantity: nextQuantity,
              unitCents,
              totalCents: nextQuantity * unitCents,
              notes: note
            }
          });
        } else {
          await prisma.orderItem.create({
            data: {
              orderId: params.orderId,
              menuItemId: menuItem.id,
              name: menuItem.name,
              quantity: safeQuantity,
              unitCents,
              totalCents: safeQuantity * unitCents,
              notes: note
            }
          });
        }
      }

      const order = await recalculateOrder(params.orderId);
      return {
        ok: true,
        warnings,
        summary: buildOrderSummary(order, params.restaurant)
      };
    }
  });

  const setCustomerDetails = llm.tool({
    description: "Speichert Kundendaten, Erfuellungsart und Lieferadresse fuer die aktuelle Bestellung.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        fulfillmentType: { type: "string", enum: ["pickup", "delivery", ""] },
        deliveryAddress: { type: "string" }
      },
      required: ["customerName", "customerPhone", "fulfillmentType", "deliveryAddress"],
      additionalProperties: false
    },
    execute: async (input: {
      customerName: string;
      customerPhone: string;
      fulfillmentType: string;
      deliveryAddress: string;
    }) => {
      const normalizedFulfillment =
        input.fulfillmentType === "pickup" || input.fulfillmentType === "delivery" ? input.fulfillmentType : undefined;
      const nextFulfillment = normalizedFulfillment;
      const zone =
        nextFulfillment === "delivery" || (!nextFulfillment && input.deliveryAddress)
          ? matchDeliveryZone(params.restaurant, input.deliveryAddress)
          : null;

      const order = await prisma.order.update({
        where: { id: params.orderId },
        data: {
          customerName: input.customerName.trim() ? input.customerName : undefined,
          customerPhone: input.customerPhone.trim() ? input.customerPhone : undefined,
          fulfillmentType: normalizedFulfillment,
          deliveryAddress: input.deliveryAddress.trim() ? input.deliveryAddress : undefined,
          deliveryFeeCents:
            normalizedFulfillment === "pickup"
              ? 0
              : zone
                ? zone.feeCents
                : undefined
        },
        include: {
          items: true,
          events: {
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      });

      const refreshedOrder = await recalculateOrder(order.id);
      return {
        ok: true,
        zone: zone
          ? {
              name: zone.name,
              minimumOrderCents: zone.minimumOrderCents,
              feeCents: zone.feeCents
            }
          : null,
        summary: buildOrderSummary(refreshedOrder, params.restaurant)
      };
    }
  });

  const finalizeOrder = llm.tool({
    description:
      "Prueft die Bestellung hart auf Pflichtdaten, Lieferadresse und Mindestbestellwert und schliesst sie bei Erfolg ab.",
    execute: async () => {
      const order = await recalculateOrder(params.orderId);

      if (order.items.length === 0) {
        return { ok: false, reason: "empty_order", message: "Es sind noch keine Artikel im Warenkorb." };
      }

      if (!order.customerName) {
        return { ok: false, reason: "missing_name", message: "Der Name fuer die Bestellung fehlt noch." };
      }

      if (!order.customerPhone) {
        return { ok: false, reason: "missing_phone", message: "Die Rueckrufnummer fehlt noch." };
      }

      if (order.fulfillmentType === "delivery") {
        if (!order.deliveryAddress) {
          return { ok: false, reason: "missing_address", message: "Die Lieferadresse fehlt noch." };
        }

        const zone = matchDeliveryZone(params.restaurant, order.deliveryAddress);
        if (!zone && params.restaurant.deliveryZones.length > 0) {
          return {
            ok: false,
            reason: "delivery_zone_unknown",
            message: "Die Lieferadresse liegt noch keiner bekannten Lieferzone zugeordnet vor."
          };
        }

        if (zone) {
          const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
              deliveryFeeCents: zone.feeCents
            },
            include: {
              items: true,
              events: {
                orderBy: { createdAt: "desc" },
                take: 5
              }
            }
          });

          const recalculated = await recalculateOrder(updatedOrder.id);
          if (recalculated.subtotalCents < zone.minimumOrderCents) {
            return {
              ok: false,
              reason: "minimum_order_not_met",
              message: `Fuer Lieferung in ${zone.name} gilt ein Mindestbestellwert von ${formatMoney(zone.minimumOrderCents)}. Aktuell sind erst ${formatMoney(recalculated.subtotalCents)} erreicht.`,
              summary: buildOrderSummary(recalculated, params.restaurant)
            };
          }
        }
      }

      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "pending_restaurant"
          }
        }),
        prisma.orderStatusEvent.create({
          data: {
            orderId: order.id,
            status: "pending_restaurant",
            note: "Browser-Voice-Bestellung abgeschlossen"
          }
        }),
        prisma.call.update({
          where: { id: params.callId },
          data: {
            status: "completed",
            endedAt: new Date()
          }
        })
      ]);

      const finalOrder = await loadOrderSnapshot(order.id);
      return {
        ok: true,
        message: "Bestellung erfolgreich abgeschlossen und im Dashboard gespeichert.",
        summary: finalOrder ? buildOrderSummary(finalOrder, params.restaurant) : null
      };
    }
  });

  const getOrderSummary = llm.tool({
    description: "Liefert den aktuellen Warenkorb und die Kundendaten fuer die aktive Bestellung.",
    execute: async () => {
      const order = await loadOrderSnapshot(params.orderId);
      return order ? buildOrderSummary(order, params.restaurant) : null;
    }
  });

  return {
    addOrderItems,
    setCustomerDetails,
    finalizeOrder,
    getOrderSummary
  };
}

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "kebab-phone-agent";
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID ?? "3f4ade23-6eb4-4279-ab05-6a144947c4d5";

const agentDefinition = defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    console.log("[agent] browser/livekit job connected", {
      roomName: ctx.room.name,
      participantIdentity: participant.identity,
      roomMetadata: ctx.room.metadata ?? null,
      participantMetadata: participant.metadata ?? null
    });

    const vad = ctx.proc.userData.vad as silero.VAD;
    const roomMetadata = parseMetadata(ctx.room.metadata);
    const participantMetadata = parseMetadata(participant.metadata);
    const restaurantId =
      (typeof roomMetadata?.restaurantId === "string" ? roomMetadata.restaurantId : null) ??
      (typeof participantMetadata?.restaurantId === "string" ? participantMetadata.restaurantId : null) ??
      participant.attributes?.restaurantId ??
      null;
    const restaurant = restaurantId ? await loadRestaurantContext(restaurantId) : null;
    const greeting =
      restaurant?.agentConfig?.greeting ??
      (restaurant
        ? `Guten Tag, hier ist der KI-Bestellassistent von ${restaurant.name}. Was moechten Sie bestellen?`
        : "Guten Tag, hier ist der KI-Bestellassistent. Was moechten Sie bestellen?");
    const voiceOrderSession = restaurant
      ? await createVoiceOrderSession(
          restaurant,
          ctx.room.name ?? `browser-call-${Date.now()}`,
          participant.identity === "Browser Demo" ? null : participant.identity,
          greeting
        )
      : null;
    let transcriptText = voiceOrderSession?.transcriptText ?? "";
    let terminalCallStateWritten = false;

    const session = new voice.AgentSession({
      vad,
      maxToolSteps: 8,
      turnHandling: {
        turnDetection: "vad",
        endpointing: {
          minDelay: 350,
          maxDelay: 1200
        }
      },
      stt: new inference.STT({
        model: "deepgram/nova-3",
        language: "de"
      }),
      llm: new inference.LLM({
        model: "openai/gpt-5.3-chat-latest"
      }),
      tts: new inference.TTS({
        model: "cartesia/sonic-3",
        voice: CARTESIA_VOICE_ID,
        language: "de",
        modelOptions: {
          speed: 0.96,
          volume: 1
        }
      })
    });

    if (voiceOrderSession) {
      const markVoiceCallFailed = async (reason: string) => {
        if (terminalCallStateWritten) {
          return;
        }

        terminalCallStateWritten = true;
        transcriptText = appendTranscript(transcriptText, "assistant", `Systemhinweis: ${reason}`);
        await prisma.call.update({
          where: { id: voiceOrderSession.callId },
          data: {
            status: "failed",
            endedAt: new Date(),
            transcriptText
          }
        });
      };

      await prisma.call.update({
        where: { id: voiceOrderSession.callId },
        data: {
          transcriptText
        }
      });

      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (event) => {
        if (!event.isFinal || event.transcript.trim().length === 0) {
          return;
        }

        transcriptText = appendTranscript(transcriptText, "caller", event.transcript);
        await prisma.call.update({
          where: { id: voiceOrderSession.callId },
          data: {
            transcriptText
          }
        });
      });

      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, async (event) => {
        if (event.item.role !== "assistant") {
          return;
        }

        const text = event.item.textContent?.trim();
        if (!text) {
          return;
        }

        transcriptText = appendTranscript(transcriptText, "assistant", text);
        await prisma.call.update({
          where: { id: voiceOrderSession.callId },
          data: {
            transcriptText
          }
        });
      });

      session.on(voice.AgentSessionEventTypes.Error, async (event) => {
        const reason = describeAgentError(event.error);
        console.error("[agent] session error", {
          roomName: ctx.room.name,
          callId: voiceOrderSession.callId,
          reason
        });
        await markVoiceCallFailed(reason);
      });

      session.on(voice.AgentSessionEventTypes.Close, async (event) => {
        if (event.reason !== "error" || !event.error) {
          return;
        }

        const reason = describeAgentError(event.error);
        console.error("[agent] session closed with error", {
          roomName: ctx.room.name,
          callId: voiceOrderSession.callId,
          reason
        });
        await markVoiceCallFailed(reason);
      });
    }

    try {
      await session.start({
        room: ctx.room,
        agent: new RestaurantAgent({
          greeting,
          restaurantName: restaurant?.name,
          menuContext: summarizeMenu(restaurant),
          deliveryContext: summarizeDelivery(restaurant),
          tools:
            restaurant && voiceOrderSession
              ? createOrderTools({
                  restaurant,
                  orderId: voiceOrderSession.orderId,
                  callId: voiceOrderSession.callId
                })
              : undefined
        })
      });
    } catch (error) {
      if (voiceOrderSession) {
        const reason = describeAgentError(error);
        console.error("[agent] session.start failed", {
          roomName: ctx.room.name,
          callId: voiceOrderSession.callId,
          reason
        });
        if (!terminalCallStateWritten) {
          transcriptText = appendTranscript(transcriptText, "assistant", `Systemhinweis: ${reason}`);
          await prisma.call.update({
            where: { id: voiceOrderSession.callId },
            data: {
              status: "failed",
              endedAt: new Date(),
              transcriptText
            }
          });
        }
      }

      throw error;
    }
  }
});

export default agentDefinition;

async function main() {
  const missing = missingEnvironment();

  if (missing.length > 0) {
    console.log(`Agent worker is in standby. Missing LiveKit configuration: ${missing.join(", ")}`);
    return;
  }

  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: AGENT_NAME
    })
  );
}

await main();
