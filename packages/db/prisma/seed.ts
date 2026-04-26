import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function scrypt(password: string, salt: string) {
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

async function hashPassword(password: string) {
  const salt = "demo-seed-salt";
  const derivedKey = await scrypt(password, salt);
  return `${salt}:${derivedKey}`;
}

async function main() {
  const passwordHash = await hashPassword("supersecret");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-restaurant" },
    update: {},
    create: {
      name: "Demo Restaurant GmbH",
      slug: "demo-restaurant"
    }
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {
      passwordHash,
      emailVerifiedAt: new Date()
    },
    create: {
      email: "owner@example.com",
      name: "Demo Owner",
      passwordHash,
      emailVerifiedAt: new Date()
    }
  });

  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: "owner"
    }
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      onboardingStatus: "menu_imported"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      name: "Demo Kebab",
      phone: "+49301234567",
      addressLine1: "Hauptstrasse 1",
      postalCode: "10115",
      city: "Berlin",
      countryCode: "DE",
      onboardingStatus: "menu_imported",
      agentConfig: {
        create: {
          greeting: "Guten Tag, hier ist der KI-Bestellassistent von Demo Kebab. Was moechten Sie bestellen?"
        }
      }
    }
  });

  const menu = await prisma.menu.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {
      isActive: true
    },
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      restaurantId: restaurant.id,
      name: "Starter-Menue",
      isActive: true
    }
  });

  const mains = await prisma.menuCategory.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000020",
      menuId: menu.id,
      name: "Doener & Teller",
      sortOrder: 0
    }
  });

  const pizza = await prisma.menuCategory.upsert({
    where: { id: "00000000-0000-0000-0000-000000000021" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000021",
      menuId: menu.id,
      name: "Pizza",
      sortOrder: 1
    }
  });

  const items = [
    {
      id: "00000000-0000-0000-0000-000000000030",
      categoryId: mains.id,
      name: "Doener",
      description: "mit Kalbfleisch, Salat und Sauce",
      priceCents: 750
    },
    {
      id: "00000000-0000-0000-0000-000000000031",
      categoryId: mains.id,
      name: "Doener Teller",
      description: "mit Fleisch, Reis, Salat und Sauce",
      priceCents: 950
    },
    {
      id: "00000000-0000-0000-0000-000000000032",
      categoryId: mains.id,
      name: "Dueruem",
      description: "gerollt mit Fleisch, Salat und Sauce",
      priceCents: 850
    },
    {
      id: "00000000-0000-0000-0000-000000000033",
      categoryId: pizza.id,
      name: "Pizza Margherita",
      description: "Tomatensauce und Mozzarella",
      priceCents: 900
    },
    {
      id: "00000000-0000-0000-0000-000000000034",
      categoryId: pizza.id,
      name: "Pizza Salami",
      description: "Tomatensauce, Mozzarella und Salami",
      priceCents: 1050
    }
  ];

  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        currency: "EUR",
        isAvailable: true
      },
      create: {
        ...item,
        currency: "EUR",
        isAvailable: true
      }
    });
  }
}

await main().finally(async () => {
  await prisma.$disconnect();
});
