import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "kebab-phone-agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    identity?: string;
    roomName?: string;
    restaurantId?: string;
  };

  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_URL) {
    return NextResponse.json({ error: "LiveKit environment variables are missing." }, { status: 500 });
  }

  const roomClient = new RoomServiceClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
  const dispatchClient = new AgentDispatchClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );

  const safeIdentity =
    typeof body.identity === "string" && body.identity.trim().length > 0
      ? body.identity.trim().slice(0, 64)
      : `browser-demo-${Math.random().toString(36).slice(2, 8)}`;

  const safeRoom =
    typeof body.roomName === "string" && body.roomName.trim().length > 0
      ? body.roomName.trim().slice(0, 64)
      : `browser-demo-${Math.random().toString(36).slice(2, 8)}`;

  console.log("[livekit-token] creating browser demo room", {
    roomName: safeRoom,
    identity: safeIdentity,
    restaurantId: body.restaurantId ?? null,
    agentName: AGENT_NAME
  });

  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: safeIdentity,
    ttl: "15m",
    name: safeIdentity
  });

  token.addGrant({
    room: safeRoom,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  try {
    await roomClient.createRoom({
      name: safeRoom,
      emptyTimeout: 60 * 5,
      departureTimeout: 20,
      metadata: JSON.stringify({
        source: "browser-demo",
        restaurantId: body.restaurantId ?? null
      })
    });

    await dispatchClient.createDispatch(safeRoom, AGENT_NAME, {
      metadata: JSON.stringify({
        source: "browser-demo",
        restaurantId: body.restaurantId ?? null
      })
    });
  } catch (error) {
    console.error("[livekit-token] failed to create room or dispatch", error);
    return NextResponse.json(
      {
        error:
          "LiveKit Cloud ist gerade nicht erreichbar. Bitte pruefe Internet/DNS/VPN und starte den Browser-Call danach erneut."
      },
      { status: 503 }
    );
  }

  console.log("[livekit-token] dispatch created", {
    roomName: safeRoom,
    agentName: AGENT_NAME
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
    roomName: safeRoom,
    identity: safeIdentity,
    restaurantId: body.restaurantId ?? null
  });
}
