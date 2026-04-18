import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@restaurant-ai/db";
import crypto from "node:crypto";

const sessionCookieName = "kebab_ai_session";
const sessionTtlDays = 30;

type SessionContext = {
  sessionId: string;
  tenantId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  tenants: Array<{
    tenantId: string;
    role: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
};

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt);
  return `${salt}:${derivedKey}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) {
    return false;
  }

  const [salt, storedHash] = passwordHash.split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const derivedKey = await scrypt(password, salt);
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(derivedKey, "hex");

  if (stored.length !== candidate.length) {
    return false;
  }

  return crypto.timingSafeEqual(stored, candidate);
}

export async function createSession(reply: FastifyReply, userId: string, tenantId: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tenantId,
      tokenHash,
      expiresAt
    }
  });

  setSessionCookie(reply, rawToken, expiresAt);
}

export async function replaceSessionTenant(reply: FastifyReply, request: FastifyRequest, tenantId: string) {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const existingSession = await prisma.session.findUnique({
    where: { tokenHash }
  });

  if (!existingSession || existingSession.expiresAt <= new Date()) {
    clearSessionCookie(reply);
    return null;
  }

  await prisma.session.update({
    where: { id: existingSession.id },
    data: {
      tenantId,
      lastSeenAt: new Date()
    }
  });

  return true;
}

export async function destroySession(reply: FastifyReply, request: FastifyRequest) {
  const token = getSessionToken(request);

  if (!token) {
    clearSessionCookie(reply);
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: sha256(token)
    }
  });

  clearSessionCookie(reply);
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<SessionContext | null> {
  const token = getSessionToken(request);

  if (!token) {
    reply.status(401).send({
      error: "unauthorized",
      message: "Please sign in to continue."
    });
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: sha256(token)
    },
    include: {
      user: {
        include: {
          tenants: {
            include: {
              tenant: true
            }
          }
        }
      },
      tenant: true
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    clearSessionCookie(reply);
    reply.status(401).send({
      error: "session_expired",
      message: "Your session has expired. Please sign in again."
    });
    return null;
  }

  const tenantMembership = session.user.tenants.find((membership) => membership.tenantId === session.tenantId);

  if (!tenantMembership) {
    clearSessionCookie(reply);
    reply.status(403).send({
      error: "tenant_access_denied",
      message: "The current session is not linked to this tenant."
    });
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name
    },
    tenants: session.user.tenants
  };
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  reply.header(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function getSessionToken(request: FastifyRequest) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";").map((part) => part.trim());

  for (const part of parts) {
    if (part.startsWith(`${sessionCookieName}=`)) {
      return decodeURIComponent(part.slice(sessionCookieName.length + 1));
    }
  }

  return null;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function scrypt(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });
}
