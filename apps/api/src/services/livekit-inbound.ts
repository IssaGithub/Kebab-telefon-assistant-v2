import { CallStatus } from "@prisma/client";
import { prisma } from "@restaurant-ai/db";
import { SipClient, type WebhookEvent, WebhookReceiver } from "livekit-server-sdk";

const LIVEKIT_PARTICIPANT_KIND_SIP = 3;

const inboundConfigKeys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

type InboundConfigKey = (typeof inboundConfigKeys)[number];

function missingInboundConfig() {
  return inboundConfigKeys.filter((key) => !process.env[key]);
}

function getInboundConfig(): Record<InboundConfigKey, string> {
  const missing = missingInboundConfig();

  if (missing.length > 0) {
    throw Object.assign(new Error("LiveKit inbound call handling is not configured"), {
      code: "livekit_not_configured",
      missing
    });
  }

  return {
    LIVEKIT_URL: process.env.LIVEKIT_URL as string,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY as string,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET as string
  };
}

function getSipClient() {
  const config = getInboundConfig();
  return new SipClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
}

function getWebhookReceiver() {
  const config = getInboundConfig();
  return new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
}

function roomPrefixForRestaurant(restaurantId: string) {
  return `restaurant-${restaurantId}-call-`;
}

function ruleNameForPhone(phoneNumberId: string) {
  return `restaurant-phone-${phoneNumberId}`;
}

function tryParseMetadata(metadata: string | undefined) {
  if (!metadata) {
    return null;
  }

  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractRestaurantId(event: WebhookEvent) {
  const attributes = event.participant?.attributes ?? {};
  const attrRestaurantId = attributes.restaurantId;

  if (attrRestaurantId) {
    return attrRestaurantId;
  }

  const metadata = tryParseMetadata(event.participant?.metadata);
  if (typeof metadata?.restaurantId === "string") {
    return metadata.restaurantId;
  }

  const roomName = event.room?.name ?? "";
  const match = roomName.match(/restaurant-([0-9a-f-]{36})-call-/i);
  return match?.[1] ?? null;
}

function extractCallerNumber(event: WebhookEvent) {
  const participant = event.participant;

  if (!participant) {
    return null;
  }

  return (
    participant.attributes?.["sip.phone_number"] ??
    participant.attributes?.phoneNumber ??
    participant.identity ??
    participant.name ??
    null
  );
}

function eventTimestamp(event: WebhookEvent) {
  if (!event.createdAt) {
    return new Date();
  }

  return new Date(Number(event.createdAt) * 1000);
}

function callStatusForEvent(eventName: string) {
  if (eventName === "participant_connection_aborted") {
    return CallStatus.failed;
  }

  if (eventName === "participant_left" || eventName === "room_finished") {
    return CallStatus.completed;
  }

  return CallStatus.active;
}

export async function syncInboundDispatchRule(phoneNumber: {
  id: string;
  restaurantId: string;
  e164: string;
  sipTrunkId: string | null;
  livekitDispatchRuleId: string | null;
}) {
  if (!phoneNumber.sipTrunkId) {
    return {
      synced: false,
      reason: "missing_trunk"
    };
  }

  const sipClient = getSipClient();

  if (phoneNumber.livekitDispatchRuleId) {
    await sipClient.deleteSipDispatchRule(phoneNumber.livekitDispatchRuleId).catch(() => null);
  }

  const createdRule = await sipClient.createSipDispatchRule(
    {
      type: "individual",
      roomPrefix: roomPrefixForRestaurant(phoneNumber.restaurantId)
    },
    {
      name: ruleNameForPhone(phoneNumber.id),
      metadata: JSON.stringify({
        restaurantId: phoneNumber.restaurantId,
        phoneNumberId: phoneNumber.id,
        calledNumber: phoneNumber.e164
      }),
      trunkIds: [phoneNumber.sipTrunkId],
      attributes: {
        restaurantId: phoneNumber.restaurantId,
        phoneNumberId: phoneNumber.id,
        calledNumber: phoneNumber.e164
      }
    }
  );

  const updatedPhoneNumber = await prisma.phoneNumber.update({
    where: { id: phoneNumber.id },
    data: {
      livekitDispatchRuleId: createdRule.sipDispatchRuleId
    }
  });

  return {
    synced: true,
    dispatchRuleId: updatedPhoneNumber.livekitDispatchRuleId
  };
}

export async function receiveWebhookEvent(rawBody: string, authHeader?: string, skipAuth = false) {
  const receiver = getWebhookReceiver();
  return receiver.receive(rawBody, authHeader, skipAuth);
}

export async function processWebhookEvent(event: WebhookEvent) {
  const participant = event.participant;

  if (participant?.kind !== LIVEKIT_PARTICIPANT_KIND_SIP && event.event !== "room_finished") {
    return {
      ignored: true,
      reason: "non_sip_participant"
    };
  }

  const restaurantId = extractRestaurantId(event);
  if (!restaurantId) {
    return {
      ignored: true,
      reason: "restaurant_not_resolved"
    };
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      agentConfig: {
        select: {
          greeting: true
        }
      }
    }
  });

  if (!restaurant) {
    return {
      ignored: true,
      reason: "restaurant_not_found"
    };
  }

  const roomName = event.room?.name ?? "";
  const callerNumber = extractCallerNumber(event);
  const eventTime = eventTimestamp(event);
  const endedAt =
    event.event === "participant_left" || event.event === "participant_connection_aborted" || event.event === "room_finished"
      ? eventTime
      : undefined;
  const greeting =
    restaurant.agentConfig?.greeting ??
    `Guten Tag, hier ist der KI-Bestellassistent von ${restaurant.name}. Was moechten Sie bestellen?`;

  const result = await prisma.$transaction(async (tx) => {
    const existingCall = await tx.call.findFirst({
      where: {
        restaurantId,
        livekitRoom: roomName || undefined
      },
      include: {
        orders: {
          take: 1
        }
      }
    });

    const call =
      existingCall ??
      (await tx.call.create({
        data: {
          restaurantId,
          livekitRoom: roomName || null,
          callerNumber,
          direction: "inbound",
          status: callStatusForEvent(event.event),
          startedAt: eventTime,
          transcriptText: event.event === "participant_joined" ? `Agent: ${greeting}` : null
        },
        include: {
          orders: true
        }
      }));

    const nextCall = await tx.call.update({
      where: { id: call.id },
      data: {
        callerNumber: callerNumber ?? call.callerNumber,
        status: callStatusForEvent(event.event),
        endedAt
      }
    });

    let order = call.orders[0] ?? null;

    if (!order) {
      order = await tx.order.create({
        data: {
          restaurantId,
          callId: call.id,
          customerPhone: callerNumber ?? null,
          fulfillmentType: "pickup",
          status: "draft",
          currency: "EUR"
        }
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          status: "draft",
          note: "LiveKit inbound call gestartet"
        }
      });
    }

    return {
      callId: nextCall.id,
      orderId: order.id,
      event: event.event
    };
  });

  return {
    ignored: false,
    ...result
  };
}

export { missingInboundConfig };
