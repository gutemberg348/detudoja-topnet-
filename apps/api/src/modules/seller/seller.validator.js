import { z } from "zod";

const optionalBoolean = z.preprocess((value) => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean().optional());

const optionalInt = (schema) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return value;
  }, schema.optional());

const positiveIntId = (message) => z.coerce.number().int().positive(message);

const weekDayValues = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const storeOpeningHourSchema = z
  .object({
    closesAt: z.string().regex(clockPattern, "Horario de fechamento invalido"),
    day: z.enum(weekDayValues),
    enabled: z.boolean(),
    opensAt: z.string().regex(clockPattern, "Horario de abertura invalido"),
  })
  .superRefine((value, context) => {
    if (value.enabled && value.opensAt === value.closesAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Abertura e fechamento precisam ser diferentes",
        path: ["closesAt"],
      });
    }
  });

const storeOpeningHoursSchema = z
  .array(storeOpeningHourSchema)
  .length(7, "Configure os sete dias da semana")
  .superRefine((hours, context) => {
    const days = new Set(hours.map((hour) => hour.day));

    if (days.size !== weekDayValues.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada dia da semana deve aparecer uma unica vez",
      });
    }
  });

const optionalProductDetails = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { extraInfo: value };
    }
  }

  return value;
}, z.record(z.any()).optional());

const storeAddressSchema = z.object({
  city: z.string().trim().min(2, "Informe a cidade da loja").max(120),
  complement: z.string().trim().max(180).optional().or(z.literal("")),
  district: z.string().trim().min(2, "Informe o bairro da loja").max(120),
  number: z.string().trim().min(1, "Informe o numero da loja").max(30),
  reference: z.string().trim().max(255).optional().or(z.literal("")),
  state: z.string().trim().length(2, "Informe a UF da loja").transform((value) => value.toUpperCase()),
  street: z.string().trim().min(2, "Informe a rua da loja").max(180),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 8, "CEP invalido"),
});

export const sellerOnboardingSchema = z
  .object({
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    document: z.string().trim().max(18).optional().or(z.literal("")),
    publicName: z.string().trim().min(2).max(180).optional(),
    segmentId: positiveIntId("Segmento invalido"),
    type: z.enum(["FISICA", "JURIDICA"]),
  })
  .superRefine((data, context) => {
    const digits = data.document?.replace(/\D/g, "") ?? "";

    if (data.type === "JURIDICA" && digits.length !== 14) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um CNPJ valido",
        path: ["document"],
      });
    }

    if (data.type === "FISICA" && digits && digits.length !== 11) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um CPF valido",
        path: ["document"],
      });
    }
  });

export const createAutonomousSaleSchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .min(100, "Informe um valor minimo de R$ 1,00")
    .max(999999999, "Valor acima do limite"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  title: z.string().trim().min(2, "Informe o nome da venda").max(180),
});

export const createSellerStoreSchema = z
  .object({
    categoryId: positiveIntId("Categoria invalida"),
    address: storeAddressSchema,
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    document: z.string().trim().max(18).optional().or(z.literal("")),
    email: z.string().trim().email("E-mail invalido").optional().or(z.literal("")),
    name: z.string().trim().min(2, "Informe o nome da loja").max(180),
    openForOrders: optionalBoolean,
    openingHours: storeOpeningHoursSchema.optional(),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    segmentId: positiveIntId("Segmento invalido"),
    type: z.enum(["FISICA", "JURIDICA"]),
    whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  })
  .superRefine((data, context) => {
    const digits = data.document?.replace(/\D/g, "") ?? "";

    if (data.type === "JURIDICA" && digits.length !== 14) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um CNPJ valido",
        path: ["document"],
      });
    }

    if (data.type === "FISICA" && digits && digits.length !== 11) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um CPF valido",
        path: ["document"],
      });
    }
  });

export const updateSellerStoreSchema = z.object({
  address: storeAddressSchema.optional(),
  categoryId: optionalInt(positiveIntId("Categoria invalida")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail invalido").optional().or(z.literal("")),
  name: z.string().trim().min(2, "Informe o nome da loja").max(180).optional(),
  openForOrders: optionalBoolean,
  openingHours: storeOpeningHoursSchema.optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  segmentId: optionalInt(positiveIntId("Segmento invalido")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
});

export const updateSellerStoreMediaSchema = z.object({
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

const storeProductFields = {
  acceptDelivery: optionalBoolean,
  acceptPickup: optionalBoolean,
  brand: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  details: optionalProductDetails,
  estimatedTimeMinutes: optionalInt(
    z.coerce.number().int().min(1).max(43200, "Prazo maximo de 30 dias"),
  ),
  featured: optionalBoolean,
  name: z.string().trim().min(2, "Informe o nome do produto").max(180),
  priceCents: z.coerce
    .number()
    .int()
    .min(100, "Informe um valor minimo de R$ 1,00")
    .max(999999999, "Valor acima do limite"),
  promotionalPriceCents: optionalInt(
    z.coerce.number().int().min(100).max(999999999),
  ),
  shortDescription: z.string().trim().max(220).optional().or(z.literal("")),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  stockControlled: optionalBoolean,
  stockQuantity: optionalInt(z.coerce.number().int().min(0)),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
};

export const createStoreProductSchema = z
  .object(storeProductFields)
  .superRefine((data, context) => {
    if (
      data.promotionalPriceCents &&
      data.promotionalPriceCents >= data.priceCents
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O preco promocional precisa ser menor que o preco normal",
        path: ["promotionalPriceCents"],
      });
    }

    if (data.stockControlled && data.stockQuantity === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o estoque quando controlar quantidade",
        path: ["stockQuantity"],
      });
    }

    if (data.acceptDelivery === false && data.acceptPickup === false) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O produto precisa permitir entrega ou retirada",
        path: ["acceptDelivery"],
      });
    }
  });

export const updateStoreProductSchema = z.object(storeProductFields).partial().superRefine(
  (data, context) => {
    if (
      data.promotionalPriceCents &&
      data.priceCents &&
      data.promotionalPriceCents >= data.priceCents
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O preco promocional precisa ser menor que o preco normal",
        path: ["promotionalPriceCents"],
      });
    }
  },
);

export const updateStoreOrderStatusSchema = z.object({
  status: z.enum([
    "RECEBIDO",
    "ACEITO",
    "PREPARANDO",
    "SAIU_ENTREGA",
    "PRONTO_RETIRADA",
    "CANCELADO",
  ]),
});
