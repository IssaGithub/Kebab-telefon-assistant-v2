import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-restaurant" },
    update: {},
    create: {
      name: "Demo Restaurant GmbH",
      slug: "demo-restaurant"
    }
  });

  await prisma.restaurant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      name: "Demo Kebab",
      phone: "+49301234567",
      addressLine1: "Hauptstrasse 1",
      postalCode: "10115",
      city: "Berlin",
      countryCode: "DE",
      agentConfig: {
        create: {
          greeting: "Guten Tag, hier ist der KI-Bestellassistent von Demo Kebab. Was moechten Sie bestellen?"
        }
      }
    }
  });
}

await main()
  .finally(async () => {
    await prisma.$disconnect();
  });

