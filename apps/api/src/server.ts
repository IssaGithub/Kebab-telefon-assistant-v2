import cors from "@fastify/cors";
import { prisma } from "@restaurant-ai/db";
import {
  activatePhoneSchema,
  createMenuCategorySchema,
  createMenuItemSchema,
  createMenuSchema,
  createOnboardingSchema,
  createRestaurantSchema,
  createTestCallSchema,
  orderStatusValues
} from "@restaurant-ai/shared";
import Fastify from "fastify";
import { z } from "zod";
import { createTestCall, missingLiveKitConfig } from "./services/livekit-test-call.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
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

app.get("/health", async () => ({
  status: "ok",
  service: "restaurant-ai-api"
}));

app.get("/v1/system/capabilities", async () => ({
  ordering: true,
  telephony: missingLiveKitConfig().length === 0 ? "configured" : "missing_configuration",
  missingTelephonyConfig: missingLiveKitConfig(),
  orderStatuses: orderStatusValues
}));

app.post("/v1/calls/test", async (request, reply) => {
  const input = createTestCallSchema.parse(request.body);

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

app.post("/v1/phone-numbers/activate", async (request, reply) => {
  const input = activatePhoneSchema.parse(request.body);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: { id: true }
  });

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

  return reply.status(201).send(phoneNumber);
});

app.get("/v1/restaurants/:restaurantId/phone-numbers", async (request) => {
  const params = uuidParam.parse(request.params);

  return prisma.phoneNumber.findMany({
    where: { restaurantId: params.restaurantId },
    orderBy: [{ isActive: "desc" }, { e164: "asc" }]
  });
});

app.post("/v1/onboarding", async (request, reply) => {
  const input = createOnboardingSchema.parse(request.body);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: input.tenant
    });

    const user = await tx.user.upsert({
      where: { email: input.owner.email },
      update: {
        name: input.owner.name
      },
      create: {
        email: input.owner.email,
        name: input.owner.name
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

    return { tenant, user, restaurant };
  });

  return reply.status(201).send(result);
});

app.get("/v1/restaurants", async () => {
  return prisma.restaurant.findMany({
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
  const input = createRestaurantSchema.parse(request.body);

  const restaurant = await prisma.restaurant.create({
    data: {
      ...input,
      agentConfig: {
        create: {
          greeting: `Guten Tag, hier ist der KI-Bestellassistent von ${input.name}. Was moechten Sie bestellen?`
        }
      }
    },
    include: {
      agentConfig: true
    }
  });

  return reply.status(201).send(restaurant);
});

app.get("/v1/restaurants/:restaurantId", async (request, reply) => {
  const params = uuidParam.parse(request.params);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.restaurantId },
    include: {
      tenant: true,
      agentConfig: true,
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

app.post("/v1/restaurants/:restaurantId/menus", async (request, reply) => {
  const params = uuidParam.parse(request.params);
  const input = createMenuSchema.parse(request.body);

  const menu = await prisma.menu.create({
    data: {
      ...input,
      restaurantId: params.restaurantId
    }
  });

  return reply.status(201).send(menu);
});

app.get("/v1/restaurants/:restaurantId/menus", async (request) => {
  const params = uuidParam.parse(request.params);

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
  const params = z.object({ menuId: z.string().uuid() }).parse(request.params);
  const input = createMenuCategorySchema.parse(request.body);

  const category = await prisma.menuCategory.create({
    data: {
      ...input,
      menuId: params.menuId
    }
  });

  return reply.status(201).send(category);
});

app.post("/v1/menu-categories/:categoryId/items", async (request, reply) => {
  const params = z.object({ categoryId: z.string().uuid() }).parse(request.params);
  const input = createMenuItemSchema.parse(request.body);

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
