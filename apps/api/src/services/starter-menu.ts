type PrismaTransaction = {
  menu: {
    create: (args: {
      data: {
        restaurantId: string;
        name: string;
        isActive: boolean;
      };
    }) => Promise<{ id: string }>;
  };
  menuCategory: {
    create: (args: {
      data: {
        menuId: string;
        name: string;
        sortOrder: number;
      };
    }) => Promise<{ id: string }>;
  };
  menuItem: {
    createMany: (args: {
      data: Array<{
        categoryId: string;
        name: string;
        description?: string;
        priceCents: number;
        currency: string;
        isAvailable: boolean;
      }>;
    }) => Promise<unknown>;
  };
  restaurant: {
    update: (args: {
      where: { id: string };
      data: {
        onboardingStatus?: "menu_imported";
      };
    }) => Promise<unknown>;
  };
};

export async function createStarterMenu(tx: PrismaTransaction, restaurantId: string) {
  const menu = await tx.menu.create({
    data: {
      restaurantId,
      name: "Starter-Menue",
      isActive: true
    }
  });

  const mains = await tx.menuCategory.create({
    data: {
      menuId: menu.id,
      name: "Doener & Teller",
      sortOrder: 0
    }
  });

  const pizza = await tx.menuCategory.create({
    data: {
      menuId: menu.id,
      name: "Pizza",
      sortOrder: 1
    }
  });

  await tx.menuItem.createMany({
    data: [
      {
        categoryId: mains.id,
        name: "Doener",
        description: "mit Kalbfleisch, Salat und Sauce",
        priceCents: 750,
        currency: "EUR",
        isAvailable: true
      },
      {
        categoryId: mains.id,
        name: "Doener Teller",
        description: "mit Fleisch, Reis, Salat und Sauce",
        priceCents: 950,
        currency: "EUR",
        isAvailable: true
      },
      {
        categoryId: mains.id,
        name: "Dueruem",
        description: "gerollt mit Fleisch, Salat und Sauce",
        priceCents: 850,
        currency: "EUR",
        isAvailable: true
      },
      {
        categoryId: pizza.id,
        name: "Pizza Margherita",
        description: "Tomatensauce und Mozzarella",
        priceCents: 900,
        currency: "EUR",
        isAvailable: true
      },
      {
        categoryId: pizza.id,
        name: "Pizza Salami",
        description: "Tomatensauce, Mozzarella und Salami",
        priceCents: 1050,
        currency: "EUR",
        isAvailable: true
      }
    ]
  });

  await tx.restaurant.update({
    where: { id: restaurantId },
    data: {
      onboardingStatus: "menu_imported"
    }
  });
}
