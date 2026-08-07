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

export const createServiceConversationMessageSchema = z.object({
  message: z.string().trim().max(1200, "Mensagem muito longa").optional().or(z.literal("")),
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
