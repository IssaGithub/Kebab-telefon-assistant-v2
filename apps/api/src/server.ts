import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import { prisma } from "@restaurant-ai/db";
import {
  activatePhoneSchema,
  createMenuCategorySchema,
  createMenuItemSchema,
  createMenuSchema,
  createOnboardingSchema,
  createRestaurantSchema,
  createTestCallSchema,
  loginSchema,
  orderStatusValues
} from "@restaurant-ai/shared";
import Fastify from "fastify";
import { z } from "zod";
import {
  createSession,
  destroySession,
  hashPassword,
  replaceSessionTenant,
  requireSession,
  verifyPassword
} from "./services/auth.js";
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

const slugParam = z.object({
  slug: z.string().min(2)
});

const switchTenantSchema = z.object({
  tenantId: z.string().uuid()
});

async function findTenantRestaurant(tenantId: string, restaurantId: string) {
  return prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      tenantId
    }
  });
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
      name: user.name
    },
    tenant: primaryTenant.tenant,
    tenants: user.tenants.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      tenant: membership.tenant
    }))
  };
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
    tenants: session.tenants.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      tenant: membership.tenant
    }))
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

app.get("/v1/system/capabilities", async (request, reply) => {
  const session = await requireSession(request, reply);

  if (!session) {
    return;
  }

  return {
    ordering: true,
    telephony: missingLiveKitConfig().length === 0 ? "configured" : "missing_configuration",
    missingTelephonyConfig: missingLiveKitConfig(),
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

  return reply.status(201).send(phoneNumber);
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

app.post("/v1/onboarding", async (request, reply) => {
  const input = createOnboardingSchema.parse(request.body);
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

    await createSession(reply, result.user.id, result.tenant.id);

    return reply.status(201).send(result);
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

  const restaurant = await prisma.restaurant.create({
    data: {
      ...input,
      tenantId: session.tenantId,
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
      items: true,
      events: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
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
