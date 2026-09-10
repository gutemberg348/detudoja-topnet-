import { z } from "zod";

const positiveId = (message) => z.coerce.number().int().positive(message);

export const createServiceConversationSchema = z.object({
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  destination: z.string().trim().max(300).optional().or(z.literal("")),
  orderId: positiveId("Pedido invalido").optional(),
  origin: z.string().trim().max(300).optional().or(z.literal("")),
  sellerServiceId: positiveId("Servico do prestador invalido"),
  storeId: positiveId("Loja invalida").optional(),
});

export const updateSellerServiceSchema = z.object({
  available: z.coerce.boolean(),
  serviceTypeId: positiveId("Servico invalido"),
});

export const createServiceReviewSchema = z.object({
  comment: z.string().trim().max(600, "Comentario muito longo").optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1, "Escolha de 1 a 5 estrelas").max(5, "Escolha de 1 a 5 estrelas"),
});

export const registerSellerServiceSchema = z.object({
  available: z.coerce.boolean().default(true),
  description: z.string().trim().max(500, "Descricao muito longa").optional().or(z.literal("")),
  name: z.string().trim().min(3, "Descreva o servico que voce presta").max(120),
});

export const createServiceConversationMessageSchema = z.object({
  message: z.string().trim().max(1200, "Mensagem muito longa").optional().or(z.literal("")),
});

export const createServiceConversationLocationSchema = z.object({
  label: z.enum(["RETIRADA", "DESTINO", "OUTRO"]),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length === 8,
    "Informe um CEP valido",
  ),
  street: z.string().trim().min(2, "Informe a rua").max(180),
  number: z.string().trim().min(1, "Informe o numero").max(30),
  district: z.string().trim().min(2, "Informe o bairro").max(120),
  city: z.string().trim().min(2, "Informe a cidade").max(120),
  state: z.string().trim().length(2, "Informe a UF").transform((value) => value.toUpperCase()),
  complement: z.string().trim().max(120).optional().default(""),
  reference: z.string().trim().max(180).optional().default(""),
});

export const createServiceProposalSchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .min(100, "Informe um valor minimo de R$ 1,00")
    .max(999999999, "Valor acima do limite"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  paymentMode: z.enum(["ONLINE", "QR_PRESENCIAL"]),
});

export const acceptServiceProposalSchema = z.object({
  paymentMode: z.enum(["ONLINE", "QR_PRESENCIAL"]).optional(),
}).strict();
