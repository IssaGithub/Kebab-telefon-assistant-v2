import { z } from "zod";

export const orderStatusValues = [
  "draft",
  "pending_restaurant",
  "accepted",
  "rejected",
  "cancelled",
  "completed"
] as const;

export const orderStatusSchema = z.enum(orderStatusValues);
export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().max(300).optional()
});

export const onboardingStatusValues = [
  "draft",
  "menu_imported",
  "menu_verified",
  "phone_connected",
  "test_call_done",
  "active",
  "paused"
] as const;

export const onboardingStatusSchema = z.enum(onboardingStatusValues);

export const createRestaurantSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  legalName: z.string().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().min(3),
  postalCode: z.string().min(3),
  city: z.string().min(2),
  countryCode: z.string().length(2).default("DE")
});

export const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must contain lowercase letters, numbers, and dashes only")
});

export const createOnboardingSchema = z.object({
  tenant: createTenantSchema,
  owner: z.object({
    email: z.string().email(),
    name: z.string().min(2).optional(),
    password: z.string().min(8, "Password must be at least 8 characters long")
  }),
  restaurant: createRestaurantSchema.omit({ tenantId: true })
});

export const registerSchema = createOnboardingSchema;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const switchTenantSchema = z.object({
  tenantId: z.string().uuid()
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email()
});

export const completePasswordResetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Password must be at least 8 characters long")
});

export const requestEmailVerificationSchema = z.object({
  email: z.string().email()
});

export const completeEmailVerificationSchema = z.object({
  token: z.string().min(20)
});

export const createMenuSchema = z.object({
  name: z.string().min(2),
  isActive: z.boolean().default(false)
});

export const createMenuCategorySchema = z.object({
  name: z.string().min(2),
  sortOrder: z.number().int().min(0).default(0)
});

export const createMenuItemOptionSchema = z.object({
  name: z.string().min(1),
  priceDeltaCents: z.number().int().default(0),
  isAvailable: z.boolean().default(true)
});

export const createMenuItemSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default("EUR"),
  isAvailable: z.boolean().default(true),
  options: z.array(createMenuItemOptionSchema).default([])
});

export const createTestCallSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone number must use E.164 format, for example +491701234567"),
  restaurantId: z.string().uuid().optional(),
  waitUntilAnswered: z.boolean().default(false)
});

export const startDemoCallSchema = z.object({
  callerNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone number must use E.164 format, for example +491701234567")
    .optional()
});

export const demoCallMessageSchema = z.object({
  message: z.string().min(1).max(500)
});

export const simulateInboundCallSchema = z.object({
  callerNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone number must use E.164 format, for example +491701234567")
    .optional(),
  completeCall: z.boolean().default(true)
});

export const activatePhoneSchema = z.object({
  restaurantId: z.string().uuid(),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone number must use E.164 format, for example +49301234567"),
  provider: z.string().min(2),
  sipTrunkId: z.string().min(2),
  setActive: z.boolean().default(true)
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateOnboardingInput = z.infer<typeof createOnboardingSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreateTestCallInput = z.infer<typeof createTestCallSchema>;
export type StartDemoCallInput = z.infer<typeof startDemoCallSchema>;
export type DemoCallMessageInput = z.infer<typeof demoCallMessageSchema>;
export type SimulateInboundCallInput = z.infer<typeof simulateInboundCallSchema>;
export type ActivatePhoneInput = z.infer<typeof activatePhoneSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type CompletePasswordResetInput = z.infer<typeof completePasswordResetSchema>;
export type RequestEmailVerificationInput = z.infer<typeof requestEmailVerificationSchema>;
export type CompleteEmailVerificationInput = z.infer<typeof completeEmailVerificationSchema>;
