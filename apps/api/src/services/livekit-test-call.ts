import { CallStatus } from "@prisma/client";
import { prisma } from "@restaurant-ai/db";
import type { CreateTestCallInput } from "@restaurant-ai/shared";
import { SipClient, TwirpError } from "livekit-server-sdk";

const livekitConfigKeys = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_SIP_OUTBOUND_TRUNK_ID"
] as const;

type LiveKitConfigKey = (typeof livekitConfigKeys)[number];

function missingLiveKitConfig() {
  return livekitConfigKeys.filter((key) => !process.env[key]);
}

function getLiveKitConfig(): Record<LiveKitConfigKey, string> {
  const missing = missingLiveKitConfig();

  if (missing.length > 0) {
    throw Object.assign(new Error("LiveKit SIP outbound calling is not configured"), {
      code: "livekit_not_configured",
      missing
    });
  }

  return {
    LIVEKIT_URL: process.env.LIVEKIT_URL as string,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY as string,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET as string,
    LIVEKIT_SIP_OUTBOUND_TRUNK_ID: process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID as string
  };
}

export async function createTestCall(input: CreateTestCallInput) {
  const config = getLiveKitConfig();
  const roomName = `test-call-${Date.now()}`;
  const participantIdentity = `test-${input.phoneNumber.replace(/\D/g, "")}`;

  if (input.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { id: true }
    });

    if (!restaurant) {
      throw Object.assign(new Error("Restaurant not found"), {
        code: "restaurant_not_found"
      });
    }
  }

  const sipClient = new SipClient(
    config.LIVEKIT_URL,
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET
  );

  try {
    const participant = await sipClient.createSipParticipant(
      config.LIVEKIT_SIP_OUTBOUND_TRUNK_ID,
      input.phoneNumber,
      roomName,
      {
        participantIdentity,
        participantName: "Test Caller",
        waitUntilAnswered: input.waitUntilAnswered,
        playDialtone: true
      }
    );

    const call = input.restaurantId
      ? await prisma.call.create({
          data: {
            restaurantId: input.restaurantId,
            livekitRoom: roomName,
            callerNumber: input.phoneNumber,
            direction: "outbound",
            status: input.waitUntilAnswered ? CallStatus.active : CallStatus.ringing
          }
        })
      : null;

    return {
      status: "started",
      roomName,
      participantIdentity,
      callId: call?.id ?? null,
      participant
    };
  } catch (error) {
    if (error instanceof TwirpError) {
      throw Object.assign(new Error(error.message), {
        code: "livekit_sip_error",
        sipStatusCode: error.metadata?.sip_status_code,
        sipStatus: error.metadata?.sip_status
      });
    }

    throw error;
  }
}

export { missingLiveKitConfig };

