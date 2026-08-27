import { z } from "zod";

const feePercentSchema = z.coerce
  .number()
  .min(0, "A taxa nao pode ser negativa")
  .max(100, "A taxa nao pode passar de 100%");

const optionalFeePercentSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  feePercentSchema.optional(),
);

const nullableFeePercentSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  feePercentSchema.nullable().optional(),
);

const segmentIdSchema = z.coerce
  .number()
  .int()
  .positive("Selecione um segmento valido");

const categoryIdSchema = z.coerce
  .number()
  .int()
  .positive("Selecione uma categoria valida");

const categoryFields = {
  description: z.string().trim().max(1000).optional(),
  iconUrl: z.string().trim().url("URL do icone invalida").max(2048).optional().or(z.literal("")),
  name: z.string().trim().min(2, "Informe o nome da categoria").max(120),
  status: z.enum(["ATIVA", "INATIVA"]).default("ATIVA"),
};

const salesSegmentFields = {
  categoryId: categoryIdSchema,
  description: z.string().trim().max(1000).optional(),
  feePercent: optionalFeePercentSchema,
  iconName: z.string().trim().max(80).optional().or(z.literal("")),
  name: z.string().trim().min(2, "Informe o nome do segmento").max(120),
  orderFlow: z.enum(["DIRECT_CHECKOUT", "CHAT_NEGOTIATION"]).default("DIRECT_CHECKOUT"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(["ATIVO", "INATIVO"]).default("ATIVO"),
};

export const createAdminCategorySchema = z.object(categoryFields);

export const updateAdminCategorySchema = z
  .object({
    description: categoryFields.description,
    iconUrl: categoryFields.iconUrl,
    name: categoryFields.name.optional(),
    status: z.enum(["ATIVA", "INATIVA"]).optional(),
  });

export const createAdminSalesSegmentSchema = z.object(salesSegmentFields);

export const updateAdminSalesSegmentSchema = z
  .object({
    categoryId: categoryIdSchema.optional(),
    description: salesSegmentFields.description,
    feePercent: optionalFeePercentSchema,
    iconName: salesSegmentFields.iconName,
    name: salesSegmentFields.name.optional(),
    orderFlow: salesSegmentFields.orderFlow.optional(),
    sortOrder: salesSegmentFields.sortOrder.optional(),
    status: z.enum(["ATIVO", "INATIVO"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo");

const serviceTypeFields = {
  description: z.string().trim().max(1000).optional(),
  iconName: z.string().trim().max(80).optional().or(z.literal("")),
  mode: z.enum(["NEGOCIACAO_CHAT", "PRECO_FIXO"]).default("NEGOCIACAO_CHAT"),
  name: z.string().trim().min(2, "Informe o nome do servico").max(120),
  operationalType: z.enum(["GERAL", "ENTREGA_LOCAL"]).default("GERAL"),
  segmentId: segmentIdSchema,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(["ATIVO", "INATIVO", "PAUSADO"]).default("ATIVO"),
};

export const createAdminServiceTypeSchema = z.object(serviceTypeFields);

export const updateAdminServiceTypeSchema = z
  .object({
    description: serviceTypeFields.description,
    iconName: serviceTypeFields.iconName,
    mode: serviceTypeFields.mode.optional(),
    name: serviceTypeFields.name.optional(),
    operationalType: serviceTypeFields.operationalType.optional(),
    segmentId: serviceTypeFields.segmentId.optional(),
    sortOrder: serviceTypeFields.sortOrder.optional(),
    status: serviceTypeFields.status.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo");

export const updateAdminUserStatusSchema = z.object({
  status: z.enum(["ATIVO", "INATIVO", "BLOQUEADO", "PENDENTE"]),
});

export const updateAdminUserSchema = z
  .object({
    cpf: z.string().trim().max(14).optional().or(z.literal("")),
    email: z.string().trim().email("E-mail invalido").max(255).optional(),
    name: z.string().trim().min(2, "Informe o nome").max(160).optional(),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo");

export const creditAdminUserWalletSchema = z.object({
  description: z.string().trim().min(3).max(240).default("Credito manual realizado pelo administrador"),
  valueCents: z.coerce.number().int().positive("Informe um valor positivo"),
  walletCode: z.enum(["saldo_pix", "cashback", "rede", "vendas"]),
});

export const refundAdminPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(8, "Informe um motivo de pelo menos 8 caracteres")
    .max(500, "O motivo deve ter no maximo 500 caracteres"),
});

export const updateAdminSupportSettingsSchema = z.object({
  message: z
    .string()
    .trim()
    .max(240, "A mensagem deve ter ate 240 caracteres")
    .optional()
    .or(z.literal("")),
  whatsapp: z
    .string()
    .trim()
    .min(10, "Informe o WhatsApp com DDD")
    .max(20, "WhatsApp muito longo")
    .regex(/^[+()\-\s\d]+$/, "Informe apenas numeros, DDI, DDD e separadores"),
});

export const updateAdminCategoryFeeSchema = z.object({
  feePercent: feePercentSchema,
});

const earningsDistributionPercentSchema = z.coerce
  .number()
  .min(0, "A divisao nao pode ser negativa")
  .max(100, "A divisao nao pode passar de 100%");

export const updateAdminOrderEarningsDistributionSchema = z
  .object({
    cashbackPercent: earningsDistributionPercentSchema,
    consumerReferralPercent: earningsDistributionPercentSchema,
    networkPercent: earningsDistributionPercentSchema,
    sellerReferralPercent: earningsDistributionPercentSchema,
  })
  .superRefine((data, context) => {
    const total =
      data.cashbackPercent +
      data.consumerReferralPercent +
      data.networkPercent +
      data.sellerReferralPercent;

    if (total > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A soma das partes da taxa nao pode passar de 100%",
      });
    }
  });

export const updateAdminSegmentFeeSchema = z
  .object({
    cashbackPercent: earningsDistributionPercentSchema,
    consumerReferralPercent: earningsDistributionPercentSchema,
    feePercent: feePercentSchema,
    networkPercent: earningsDistributionPercentSchema,
    sellerReferralPercent: earningsDistributionPercentSchema,
  })
  .superRefine((data, context) => {
    const distributedPercent =
      data.cashbackPercent +
      data.consumerReferralPercent +
      data.networkPercent +
      data.sellerReferralPercent;

    if (distributedPercent > data.feePercent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A divisao do segmento nao pode passar da retencao total",
      });
    }
  });

export const updateAdminStoreSchema = z
  .object({
    acceptsOnlinePayment: z.coerce.boolean().optional(),
    acceptsQrCode: z.coerce.boolean().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    segmentId: segmentIdSchema.optional(),
    customFeePercent: nullableFeePercentSchema,
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    email: z.string().trim().email("E-mail invalido").max(255).optional().or(z.literal("")),
    merchantKycStatus: z
      .enum(["PENDENTE", "EM_ANALISE", "APROVADO", "REPROVADO", "BLOQUEADO"])
      .optional(),
    merchantMonthlySalesLimitCents: z.preprocess(
      (value) => (value === "" || value === null ? null : value),
      z.coerce.number().int().min(0).nullable().optional(),
    ),
    merchantStatus: z
      .enum(["PENDENTE", "ATIVO", "PAUSADO", "BLOQUEADO", "REPROVADO"])
      .optional(),
    name: z.string().trim().min(2, "Informe o nome da loja").max(180).optional(),
    ownerEmail: z.string().trim().email("E-mail do responsavel invalido").max(255).optional(),
    ownerName: z.string().trim().min(2, "Informe o nome do responsavel").max(160).optional(),
    ownerPhone: z.string().trim().max(30).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    status: z
      .enum(["RASCUNHO", "EM_ANALISE", "ATIVA", "PAUSADA", "BLOQUEADA", "REPROVADA"])
      .optional(),
    visibleInApp: z.coerce.boolean().optional(),
    whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo");
