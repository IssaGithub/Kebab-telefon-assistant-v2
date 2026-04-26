import "./load-env.js";
import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import { prisma } from "@restaurant-ai/db";
import {
  completeEmailVerificationSchema,
  activatePhoneSchema,
  completePasswordResetSchema,
  demoCallMessageSchema,
  createMenuCategorySchema,
  createMenuItemSchema,
  createMenuSchema,
  createOnboardingSchema,
  createRestaurantSchema,
  createTestCallSchema,
  loginSchema,
  requestEmailVerificationSchema,
  requestPasswordResetSchema,
  registerSchema,
  orderStatusValues,
  simulateInboundCallSchema,
  updateOrderStatusSchema,
  startDemoCallSchema
} from "@restaurant-ai/shared";
import Fastify from "fastify";
import { z } from "zod";
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
  createSession,
  createPasswordResetToken,
  consumePasswordResetToken,
  destroySession,
  hashPassword,
  replaceSessionTenant,
  requireSession,
  verifyPassword
} from "./services/auth.js";
import { continueDemoOrderCall, startDemoOrderCall } from "./services/demo-order-call.js";
import {
  missingInboundConfig,
  processWebhookEvent,
  receiveWebhookEvent,
  syncInboundDispatchRule
} from "./services/livekit-inbound.js";
import { createTestCall, missingLiveKitConfig } from "./services/livekit-test-call.js";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "./services/mailer.js";
import { createStarterMenu } from "./services/starter-menu.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});

app.addContentTypeParser("application/webhook+json", { parseAs: "string" }, (_request, body, done) => {
  done(null, body);
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "validation_error",
      issues: error.issues
    });
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);

    if (message.includes("Environment variable not found: DATABASE_URL")) {
      return reply.status(503).send({
        error: "database_not_configured",
        message: "DATABASE_URL is missing. Copy .env.example to .env and start Postgres before using database-backed endpoints."
      });
    }
  }

  app.log.error(error);
  return reply.status(500).send({
    error: "internal_server_error"
  });
});

const uuidParam = z.object({
  restaurantId: z.string().uuid()
});

const slugParam = z.object({
  slug: z.string().min(2)
});

const switchTenantSchema = z.object({
  tenantId: z.string().uuid()
});

function serializeTenants(
  tenants: Array<{
    tenantId: string;
    role: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  }>
) {
  return tenants.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
    tenant: membership.tenant
  }));
}

function previewLink(result: { mode: string; preview: { token: string; url: string } | null } | null) {
  if (process.env.NODE_ENV === "production") {
    return {
      token: undefined,
      url: undefined
    };
  }

  return {
    token: result?.preview?.token ?? null,
    url: result?.preview?.url ?? null
  };
}

function readNumberEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function estimateTokensFromTranscript(transcriptText: string | null | undefined) {
  if (!transcriptText) {
    return {
      inputTokens: 0,
      outputTokens: 0
    };
  }

  let inputChars = 0;
  let outputChars = 0;

  for (const rawLine of transcriptText.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("Caller: ")) {
      inputChars += line.slice("Caller: ".length).length;
      continue;
    }

    if (line.startsWith("Agent: ")) {
      outputChars += line.slice("Agent: ".length).length;
    }
  }

  return {
    inputTokens: Math.ceil(inputChars / 4),
    outputTokens: Math.ceil(outputChars / 4)
  };
}

function estimateCallMinutes(startedAt: Date, endedAt: Date | null) {
  const end = endedAt ?? new Date();
  const ms = Math.max(0, end.getTime() - startedAt.getTime());
  return ms / 60000;
}

async function findTenantRestaurant(tenantId: string, restaurantId: string) {
  return prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      tenantId
    }
  });
}

async function registerTenantAccount(
  input: z.infer<typeof registerSchema>,
  reply: Parameters<typeof createSession>[0]
) {
  const passwordHash = await hashPassword(input.owner.password);
  const existingUser = await prisma.user.findUnique({
    where: {
      email: input.owner.email
    },
    select: {
      id: true
    }
  });

  if (existingUser) {
    return reply.status(409).send({
      error: "owner_email_in_use",
      message: "Diese Inhaber-E-Mail ist bereits einem anderen Account zugeordnet."
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: input.tenant
      });

      const user = await tx.user.create({
        data: {
          email: input.owner.email,
          name: input.owner.name,
          passwordHash
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "owner"
        }
      });

      const restaurant = await tx.restaurant.create({
        data: {
          ...input.restaurant,
          tenantId: tenant.id,
          agentConfig: {
            create: {
              greeting: `Guten Tag, hier ist der KI-Bestellassistent von ${input.restaurant.name}. Was moechten Sie bestellen?`
            }
          }
        },
        include: {
          agentConfig: true
        }
      });

      await createStarterMenu(tx, restaurant.id);

      const hydratedRestaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurant.id },
        include: {
          agentConfig: true
        }
      });

      return { tenant, user, restaurant: hydratedRestaurant };
    });

    const verification = await createEmailVerificationToken(result.user.email);
    const delivery = verification
      ? await sendEmailVerificationEmail({
          to: result.user.email,
          verificationToken: verification.token,
          expiresAt: verification.expiresAt
        })
      : null;
    const preview = previewLink(delivery);

    return reply.status(201).send({
      status: "verification_required",
      message: "Der Account wurde angelegt. Bitte bestaetige jetzt die E-Mail Adresse.",
      deliveryMode: delivery?.mode ?? null,
      verificationToken: preview.token,
      verificationUrl: preview.url,
      expiresAt: process.env.NODE_ENV === "production" ? undefined : verification?.expiresAt ?? null,
      tenant: result.tenant,
      restaurant: result.restaurant,
      user: {
        ...result.user,
        emailVerifiedAt: null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target);

      if (target.includes("slug")) {
        return reply.status(409).send({
          error: "tenant_slug_taken",
          message: "Diese Tenant-URL ist bereits vergeben."
        });
      }

      if (target.includes("email")) {
        return reply.status(409).send({
          error: "owner_email_in_use",
          message: "Diese Inhaber-E-Mail ist bereits einem anderen Account zugeordnet."
        });
      }
    }

    throw error;
  }
}

async function findTenantMenu(tenantId: string, menuId: string) {
  return prisma.menu.findFirst({
    where: {
      id: menuId,
      restaurant: {
        tenantId
      }
    }
  });
}

async function findTenantCategory(tenantId: string, categoryId: string) {
  return prisma.menuCategory.findFirst({
    where: {
      id: categoryId,
      menu: {
        restaurant: {
          tenantId
        }
      }
    }
  });
}

async function findTenantCall(tenantId: string, callId: string) {
  return prisma.call.findFirst({
    where: {
      id: callId,
      restaurant: {
        tenantId
      }
    }
  });
}

async function findTenantOrder(tenantId: string, orderId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      restaurant: {
        tenantId
      }
    }
  });
}

app.get("/health", async () => ({
  status: "ok",
  service: "restaurant-ai-api"
}));

app.post("/v1/auth/login", async (request, reply) => {
  const input = loginSchema.parse(request.body);

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      tenants: {
        include: {
          tenant: true
        }
      }
    }
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return reply.status(401).send({
      error: "invalid_credentials",
      message: "E-Mail oder Passwort sind ungueltig."
    });
  }

  if (!user.emailVerifiedAt) {
    return reply.status(403).send({
      error: "email_not_verified",
      message: "Bitte bestaetige zuerst die E-Mail Adresse deines Accounts."
    });
  }

  const primaryTenant = user.tenants[0];

  if (!primaryTenant) {
    return reply.status(409).send({
      error: "tenant_membership_missing",
      message: "Der Benutzer ist noch keinem Tenant zugeordnet."
    });
  }

  await createSession(reply, user.id, primaryTenant.tenantId);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt
    },
    tenant: primaryTenant.tenant,
    tenants: serializeTenants(user.tenants)
  };
});

app.post("/v1/auth/register", async (request, reply) => {
  const input = registerSchema.parse(request.body);
  return registerTenantAccount(input, reply);
});

app.get("/v1/auth/me", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const currentTenant = session.tenants.find((membership) => membership.tenantId === session.tenantId)?.tenant ?? null;

  return {
    user: session.user,
    tenant: currentTenant,
    tenants: serializeTenants(session.tenants)
  };
});

app.post("/v1/auth/switch-tenant", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const input = switchTenantSchema.parse(request.body);
  const membership = session.tenants.find((tenant) => tenant.tenantId === input.tenantId);

  if (!membership) {
    return reply.status(403).send({
      error: "tenant_access_denied",
      message: "Dieses Tenant ist fuer den aktuellen Benutzer nicht verfuegbar."
    });
  }

  await replaceSessionTenant(reply, request, input.tenantId);

  return {
    tenant: membership.tenant
  };
});

app.post("/v1/auth/logout", async (request, reply) => {
  await destroySession(reply, request);
  return reply.status(204).send();
});

app.post("/v1/auth/request-password-reset", async (request) => {
  const input = requestPasswordResetSchema.parse(request.body);
  const result = await createPasswordResetToken(input.email);

  const delivery = result ? await sendPasswordResetEmail({
    to: input.email,
    resetToken: result.token,
    expiresAt: result.expiresAt
  }) : null;
  const preview = previewLink(delivery);

  return {
    status: "ok",
    message: "Wenn ein Account mit dieser E-Mail existiert, wurde ein Reset vorbereitet.",
    deliveryMode: delivery?.mode ?? null,
    resetToken: preview.token,
    resetUrl: preview.url,
    expiresAt: process.env.NODE_ENV === "production" ? undefined : result?.expiresAt ?? null
  };
});

app.post("/v1/auth/request-email-verification", async (request) => {
  const input = requestEmailVerificationSchema.parse(request.body);
  const result = await createEmailVerificationToken(input.email);
  const delivery = result
    ? await sendEmailVerificationEmail({
        to: input.email,
        verificationToken: result.token,
        expiresAt: result.expiresAt
      })
    : null;
  const preview = previewLink(delivery);

  return {
    status: "ok",
    message: "Wenn ein unverifizierter Account mit dieser E-Mail existiert, wurde eine Bestaetigung vorbereitet.",
    deliveryMode: delivery?.mode ?? null,
    verificationToken: preview.token,
    verificationUrl: preview.url,
    expiresAt: process.env.NODE_ENV === "production" ? undefined : result?.expiresAt ?? null
  };
});

app.post("/v1/auth/verify-email", async (request, reply) => {
  const input = completeEmailVerificationSchema.parse(request.body);
  const result = await consumeEmailVerificationToken(input.token);

  if (!result || !result.tenant) {
    return reply.status(400).send({
      error: "email_verification_invalid",
      message: "Bestaetigungs-Token ist ungueltig oder abgelaufen."
    });
  }

  await createSession(reply, result.user.id, result.tenant.id);

  return {
    status: "ok",
    user: result.user,
    tenant: result.tenant
  };
});

app.post("/v1/auth/reset-password", async (request, reply) => {
  const input = completePasswordResetSchema.parse(request.body);
  const result = await consumePasswordResetToken(input.token, input.password);

  if (!result || !result.tenant) {
    return reply.status(400).send({
      error: "password_reset_invalid",
      message: "Reset-Token ist ungueltig oder abgelaufen."
    });
  }

  await createSession(reply, result.user.id, result.tenant.id);

  return {
    status: "ok",
    user: result.user,
    tenant: result.tenant
  };
});

app.get("/v1/system/capabilities", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  return {
    ordering: true,
    telephony:
      missingLiveKitConfig().length === 0 && missingInboundConfig().length === 0
        ? "configured"
        : "missing_configuration",
    missingTelephonyConfig: Array.from(new Set([...missingLiveKitConfig(), ...missingInboundConfig()])),
    orderStatuses: orderStatusValues
  };
});

app.get("/v1/dashboard/summary", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const [restaurants, orders, calls] = await Promise.all([
    prisma.restaurant.count({
      where: {
        tenantId: session.tenantId
      }
    }),
    prisma.order.count({
      where: {
        restaurant: {
          tenantId: session.tenantId
        },
        status: {
          in: ["draft", "pending_restaurant", "accepted"]
        }
      }
    }),
    prisma.call.count({
      where: {
        restaurant: {
          tenantId: session.tenantId
        },
        startedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    })
  ]);

  return {
    restaurants,
    openOrders: orders,
    callsToday: calls
  };
});

app.get("/v1/usage/summary", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const [restaurants, calls, orders] = await Promise.all([
    prisma.restaurant.findMany({
      where: {
        tenantId: session.tenantId
      },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.call.findMany({
      where: {
        restaurant: {
          tenantId: session.tenantId
        }
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        transcriptText: true,
        livekitRoom: true,
        restaurantId: true
      },
      orderBy: {
        startedAt: "desc"
      }
    }),
    prisma.order.count({
      where: {
        restaurant: {
          tenantId: session.tenantId
        }
      }
    })
  ]);

  const tokens = calls.reduce(
    (sum, call) => {
      const estimate = estimateTokensFromTranscript(call.transcriptText);
      return {
        input: sum.input + estimate.inputTokens,
        output: sum.output + estimate.outputTokens
      };
    },
    { input: 0, output: 0 }
  );

  const callMinutes = calls.reduce((sum, call) => sum + estimateCallMinutes(call.startedAt, call.endedAt), 0);
  const transcriptChars = calls.reduce((sum, call) => sum + (call.transcriptText?.length ?? 0), 0);
  const livekitRooms = new Set(calls.map((call) => call.livekitRoom).filter(Boolean)).size;

  const tokenBudget = readNumberEnv("TOKEN_BUDGET");
  const inputTokenBudget = readNumberEnv("INPUT_TOKEN_BUDGET");
  const outputTokenBudget = readNumberEnv("OUTPUT_TOKEN_BUDGET");
  const livekitCostPerMinute = readNumberEnv("LIVEKIT_COST_PER_MINUTE");
  const sttCostPerMinute = readNumberEnv("STT_COST_PER_MINUTE");
  const ttsCostPer1kChars = readNumberEnv("TTS_COST_PER_1K_CHARS");
  const llmInputCostPer1mTokens = readNumberEnv("LLM_INPUT_COST_PER_1M_TOKENS");
  const llmOutputCostPer1mTokens = readNumberEnv("LLM_OUTPUT_COST_PER_1M_TOKENS");

  const livekitCost = livekitCostPerMinute ? Math.round(callMinutes * livekitCostPerMinute * 100) : null;
  const sttCost = sttCostPerMinute ? Math.round(callMinutes * sttCostPerMinute * 100) : null;
  const ttsCost = ttsCostPer1kChars ? Math.round((transcriptChars / 1000) * ttsCostPer1kChars * 100) : null;
  const llmInputCost = llmInputCostPer1mTokens
    ? Math.round((tokens.input / 1_000_000) * llmInputCostPer1mTokens * 100)
    : null;
  const llmOutputCost = llmOutputCostPer1mTokens
    ? Math.round((tokens.output / 1_000_000) * llmOutputCostPer1mTokens * 100)
    : null;

  const totalKnownCost = [livekitCost, sttCost, ttsCost, llmInputCost, llmOutputCost].reduce<number>((sum, value) => {
    return sum + (value ?? 0);
  }, 0);

  return {
    scope: {
      tenantId: session.tenantId,
      tenantName: session.tenants.find((membership) => membership.tenantId === session.tenantId)?.tenant.name ?? null
    },
    tracked: {
      exactProviderUsage: false,
      notes: [
        "Tokenverbrauch wird aktuell aus gespeicherten Transkripten grob geschaetzt.",
        "Restguthaben bei Providern ist ohne Billing-API-Anbindung nicht verfuegbar.",
        "Kosten werden nur berechnet, wenn die passenden Preis-ENV-Variablen gesetzt sind."
      ]
    },
    totals: {
      restaurants: restaurants.length,
      orders,
      calls: calls.length,
      livekitRooms,
      callMinutes: Number(callMinutes.toFixed(2)),
      transcriptChars
    },
    tokens: {
      estimatedInputTokens: tokens.input,
      estimatedOutputTokens: tokens.output,
      estimatedTotalTokens: tokens.input + tokens.output,
      budgetTotal: tokenBudget,
      budgetInput: inputTokenBudget,
      budgetOutput: outputTokenBudget,
      remainingTotal: tokenBudget !== null ? Math.max(0, tokenBudget - (tokens.input + tokens.output)) : null,
      remainingInput: inputTokenBudget !== null ? Math.max(0, inputTokenBudget - tokens.input) : null,
      remainingOutput: outputTokenBudget !== null ? Math.max(0, outputTokenBudget - tokens.output) : null
    },
    costs: {
      livekitCents: livekitCost,
      sttCents: sttCost,
      ttsCents: ttsCost,
      llmInputCents: llmInputCost,
      llmOutputCents: llmOutputCost,
      totalKnownCents: totalKnownCost > 0 ? totalKnownCost : null
    },
    pricingConfig: {
      livekitCostPerMinute,
      sttCostPerMinute,
      ttsCostPer1kChars,
      llmInputCostPer1mTokens,
      llmOutputCostPer1mTokens
    }
  };
});

app.get("/v1/tenants/:slug", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = slugParam.parse(request.params);

  if (!session.tenants.some((membership) => membership.tenant.slug === params.slug)) {
    return reply.status(403).send({
      error: "tenant_access_denied",
      message: "Dieses Tenant ist fuer den aktuellen Benutzer nicht verfuegbar."
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.slug },
    include: {
      restaurants: {
        orderBy: {
          createdAt: "asc"
        },
        include: {
          agentConfig: true,
          phoneNumbers: {
            orderBy: [{ isActive: "desc" }, { e164: "asc" }]
          },
          menus: {
            orderBy: { createdAt: "desc" },
            include: {
              categories: {
                orderBy: { sortOrder: "asc" },
                include: {
                  items: {
                    include: {
                      options: true
                    }
                  }
                }
              }
            }
          },
          _count: {
            select: {
              calls: true,
              orders: true
            }
          }
        }
      },
      users: {
        include: {
          user: true
        }
      }
    }
  });

  if (!tenant) {
    return reply.status(404).send({ error: "tenant_not_found" });
  }

  return tenant;
});

app.post("/v1/calls/test", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const input = createTestCallSchema.parse(request.body);

  if (input.restaurantId) {
    const restaurant = await findTenantRestaurant(session.tenantId, input.restaurantId);

    if (!restaurant) {
      return reply.status(404).send({
        error: "restaurant_not_found",
        message: "Restaurant wurde nicht gefunden."
      });
    }
  }

  try {
    const result = await createTestCall(input);
    return reply.status(201).send(result);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const codedError = error as {
        code: string;
        message: string;
        missing?: string[];
        sipStatus?: string;
        sipStatusCode?: string;
      };

      if (codedError.code === "livekit_not_configured") {
        return reply.status(409).send({
          error: codedError.code,
          message: codedError.message,
          missing: codedError.missing
        });
      }

      if (codedError.code === "restaurant_not_found") {
        return reply.status(404).send({
          error: codedError.code,
          message: codedError.message
        });
      }

      if (codedError.code === "livekit_sip_error") {
        return reply.status(502).send({
          error: codedError.code,
          message: codedError.message,
          sipStatus: codedError.sipStatus,
          sipStatusCode: codedError.sipStatusCode
        });
      }
    }

    throw error;
  }
});

app.post("/v1/restaurants/:restaurantId/demo-call", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);
  const input = startDemoCallSchema.parse(request.body ?? {});
  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({
      error: "restaurant_not_found",
      message: "Restaurant wurde nicht gefunden."
    });
  }

  const result = await startDemoOrderCall(params.restaurantId, input.callerNumber);
  return reply.status(201).send(result);
});

app.post("/v1/demo-calls/:callId/messages", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = z.object({ callId: z.string().uuid() }).parse(request.params);
  const input = demoCallMessageSchema.parse(request.body);
  const call = await findTenantCall(session.tenantId, params.callId);

  if (!call) {
    return reply.status(404).send({
      error: "demo_call_not_found",
      message: "Demo-Anruf wurde nicht gefunden."
    });
  }

  const result = await continueDemoOrderCall(params.callId, input.message);
  return reply.send(result);
});

app.post("/v1/phone-numbers/activate", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const input = activatePhoneSchema.parse(request.body);

  const restaurant = await findTenantRestaurant(session.tenantId, input.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  const phoneNumber = await prisma.$transaction(async (tx) => {
    if (input.setActive) {
      await tx.phoneNumber.updateMany({
        where: { restaurantId: input.restaurantId },
        data: { isActive: false }
      });
    }

    const activatedPhone = await tx.phoneNumber.upsert({
      where: { e164: input.phoneNumber },
      update: {
        restaurantId: input.restaurantId,
        provider: input.provider,
        sipTrunkId: input.sipTrunkId,
        isActive: input.setActive
      },
      create: {
        restaurantId: input.restaurantId,
        e164: input.phoneNumber,
        provider: input.provider,
        sipTrunkId: input.sipTrunkId,
        isActive: input.setActive
      }
    });

    await tx.restaurant.update({
      where: { id: input.restaurantId },
      data: {
        phone: input.phoneNumber,
        onboardingStatus: "phone_connected"
      }
    });

    return activatedPhone;
  });

  let livekitDispatchRuleId = phoneNumber.livekitDispatchRuleId ?? null;

  if (input.provider === "LiveKit SIP" && input.sipTrunkId) {
    try {
      const syncedRule = await syncInboundDispatchRule(phoneNumber);
      if (syncedRule.synced) {
        livekitDispatchRuleId = syncedRule.dispatchRuleId ?? null;
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "livekit_not_configured") {
        return reply.status(409).send({
          error: "livekit_not_configured",
          message: "LiveKit inbound dispatch could not be configured.",
          missing: missingInboundConfig()
        });
      }

      if (error instanceof Error) {
        return reply.status(502).send({
          error: "livekit_dispatch_sync_failed",
          message: error.message
        });
      }

      throw error;
    }
  }

  return reply.status(201).send({
    ...phoneNumber,
    livekitDispatchRuleId
  });
});

app.get("/v1/restaurants/:restaurantId/phone-numbers", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);

  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  return prisma.phoneNumber.findMany({
    where: { restaurantId: params.restaurantId },
    orderBy: [{ isActive: "desc" }, { e164: "asc" }]
  });
});

app.post("/v1/livekit/webhook", async (request, reply) => {
  const contentType = request.headers["content-type"] ?? "";

  if (!String(contentType).includes("application/webhook+json")) {
    return reply.status(415).send({
      error: "unsupported_media_type",
      message: "Expected application/webhook+json"
    });
  }

  const rawBody = typeof request.body === "string" ? request.body : "";
  const authHeader = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
  const skipAuth = process.env.NODE_ENV !== "production" && request.headers["x-livekit-skip-auth"] === "1";

  try {
    const event = await receiveWebhookEvent(rawBody, authHeader, skipAuth);
    const result = await processWebhookEvent(event);
    return reply.send({
      ok: true,
      event: event.event,
      result
    });
  } catch (error) {
    if (error instanceof Error) {
      return reply.status(401).send({
        error: "livekit_webhook_invalid",
        message: error.message
      });
    }

    throw error;
  }
});

app.post("/v1/onboarding", async (request, reply) => {
  const input = createOnboardingSchema.parse(request.body);
  return registerTenantAccount(input, reply);
});

app.get("/v1/restaurants", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  return prisma.restaurant.findMany({
    where: {
      tenantId: session.tenantId
    },
    orderBy: { createdAt: "desc" },
    include: {
      tenant: true,
      agentConfig: true,
      _count: {
        select: {
          menus: true,
          orders: true,
          calls: true
        }
      }
    }
  });
});

app.post("/v1/restaurants", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const input = createRestaurantSchema.omit({ tenantId: true }).parse(request.body);

  const restaurant = await prisma.$transaction(async (tx) => {
    const createdRestaurant = await tx.restaurant.create({
      data: {
        ...input,
        tenantId: session.tenantId,
        agentConfig: {
          create: {
            greeting: `Guten Tag, hier ist der KI-Bestellassistent von ${input.name}. Was moechten Sie bestellen?`
          }
        }
      }
    });

    await createStarterMenu(tx, createdRestaurant.id);

    return tx.restaurant.findUniqueOrThrow({
      where: { id: createdRestaurant.id },
      include: {
        agentConfig: true
      }
    });
  });

  return reply.status(201).send(restaurant);
});

app.get("/v1/restaurants/:restaurantId", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);

  const restaurant = await prisma.restaurant.findFirst({
    where: {
      id: params.restaurantId,
      tenantId: session.tenantId
    },
    include: {
      tenant: true,
      agentConfig: true,
      phoneNumbers: {
        orderBy: [{ isActive: "desc" }, { e164: "asc" }]
      },
      calls: {
        orderBy: { startedAt: "desc" },
        take: 10
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          items: true
        }
      },
      menus: {
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                include: {
                  options: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  return restaurant;
});

app.get("/v1/restaurants/:restaurantId/orders", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);

  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  return prisma.order.findMany({
    where: { restaurantId: params.restaurantId },
    orderBy: { createdAt: "desc" },
    include: {
      call: {
        select: {
          id: true,
          status: true,
          callerNumber: true,
          livekitRoom: true,
          startedAt: true,
          endedAt: true
        }
      },
      items: true,
      events: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
});

app.post("/v1/orders/:orderId/status", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = z.object({ orderId: z.string().uuid() }).parse(request.params);
  const input = updateOrderStatusSchema.parse(request.body);
  const order = await findTenantOrder(session.tenantId, params.orderId);

  if (!order) {
    return reply.status(404).send({
      error: "order_not_found",
      message: "Bestellung wurde nicht gefunden."
    });
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const nextOrder = await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: input.status
      },
      include: {
        items: true,
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: params.orderId,
        status: input.status,
        note: input.note
      }
    });

    return nextOrder;
  });

  return reply.send(updatedOrder);
});

app.get("/v1/restaurants/:restaurantId/calls", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);

  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  return prisma.call.findMany({
    where: { restaurantId: params.restaurantId },
    orderBy: { startedAt: "desc" }
  });
});

app.post("/v1/restaurants/:restaurantId/inbound-call/simulate", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);
  const input = simulateInboundCallSchema.parse(request.body ?? {});
  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({
      error: "restaurant_not_found",
      message: "Restaurant wurde nicht gefunden."
    });
  }

  const roomName = `restaurant-${params.restaurantId}-call-${Date.now()}`;
  const callerNumber = input.callerNumber ?? "+491701234567";

  const joinedEvent = {
    event: "participant_joined",
    id: `sim-joined-${Date.now()}`,
    createdAt: BigInt(Math.floor(Date.now() / 1000)),
    room: {
      name: roomName
    },
    participant: {
      sid: "PA_SIM",
      identity: callerNumber,
      name: callerNumber,
      kind: 3,
      attributes: {
        restaurantId: params.restaurantId,
        calledNumber: restaurant.phone ?? ""
      }
    }
  };

  const started = await processWebhookEvent(joinedEvent as never);

  let completed: Awaited<ReturnType<typeof processWebhookEvent>> | null = null;
  if (input.completeCall) {
    const leftEvent = {
      event: "participant_left",
      id: `sim-left-${Date.now()}`,
      createdAt: BigInt(Math.floor(Date.now() / 1000) + 1),
      room: {
        name: roomName
      },
      participant: {
        sid: "PA_SIM",
        identity: callerNumber,
        name: callerNumber,
        kind: 3,
        attributes: {
          restaurantId: params.restaurantId,
          calledNumber: restaurant.phone ?? ""
        }
      }
    };

    completed = await processWebhookEvent(leftEvent as never);
  }

  return reply.status(201).send({
    started,
    completed
  });
});

app.post("/v1/restaurants/:restaurantId/menus", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);
  const input = createMenuSchema.parse(request.body);
  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  const menu = await prisma.menu.create({
    data: {
      ...input,
      restaurantId: params.restaurantId
    }
  });

  return reply.status(201).send(menu);
});

app.get("/v1/restaurants/:restaurantId/menus", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = uuidParam.parse(request.params);
  const restaurant = await findTenantRestaurant(session.tenantId, params.restaurantId);

  if (!restaurant) {
    return reply.status(404).send({ error: "restaurant_not_found" });
  }

  return prisma.menu.findMany({
    where: { restaurantId: params.restaurantId },
    orderBy: { createdAt: "desc" },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            include: {
              options: true
            }
          }
        }
      }
    }
  });
});

app.post("/v1/menus/:menuId/categories", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = z.object({ menuId: z.string().uuid() }).parse(request.params);
  const input = createMenuCategorySchema.parse(request.body);
  const menu = await findTenantMenu(session.tenantId, params.menuId);

  if (!menu) {
    return reply.status(404).send({ error: "menu_not_found" });
  }

  const category = await prisma.menuCategory.create({
    data: {
      ...input,
      menuId: params.menuId
    }
  });

  return reply.status(201).send(category);
});

app.post("/v1/menu-categories/:categoryId/items", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  const params = z.object({ categoryId: z.string().uuid() }).parse(request.params);
  const input = createMenuItemSchema.parse(request.body);
  const category = await findTenantCategory(session.tenantId, params.categoryId);

  if (!category) {
    return reply.status(404).send({ error: "menu_category_not_found" });
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId: params.categoryId,
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      currency: input.currency,
      isAvailable: input.isAvailable,
      options: {
        create: input.options
      }
    },
    include: {
      options: true
    }
  });

  return reply.status(201).send(item);
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
