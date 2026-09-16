import { z } from "zod";
import { chatAttachmentFields, validateMessageAttachment } from "../chat-media/chat-media.validator.js";

const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

const checkoutAddressSchema = z.object({
  bairro: z.string().trim().min(1, "Informe o bairro").max(120),
  cep: z.string().transform(onlyDigits).refine((value) => value.length === 8, "CEP invalido"),
  cidade: z.string().trim().min(1, "Informe a cidade").max(120),
  complemento: z.string().trim().max(180).optional().or(z.literal("")),
  estado: z.string().trim().length(2, "UF invalida").transform((value) => value.toUpperCase()),
  numero: z.string().trim().min(1, "Informe o numero").max(30),
  referencia: z.string().trim().max(255).optional().or(z.literal("")),
  rua: z.string().trim().min(1, "Informe a rua").max(180),
});

export const createCheckoutOrderSchema = z
  .object({
    address: checkoutAddressSchema.optional().nullable(),
    addressId: z.coerce.number().int().positive("Endereco invalido").optional().nullable(),
    deliveryMode: z.enum(["delivery", "pickup"]),
    items: z
      .array(
        z.object({
          notes: z.string().trim().max(500).optional().or(z.literal("")),
          productId: z.coerce.number().int().positive("Produto invalido"),
          quantity: z.coerce.number().int().min(1).max(99),
        }),
      )
      .min(1, "Informe ao menos um item"),
    payment: z
      .object({
        balanceUsedCents: z.coerce.number().int().min(0).optional(),
        pixComplementCents: z.coerce.number().int().min(0).optional(),
        useBalance: z.boolean().optional(),
      })
      .optional(),
    storeId: z.coerce.number().int().positive("Loja invalida"),
  })
  .superRefine((data, context) => {
    if (data.deliveryMode === "delivery" && !data.addressId && !data.address) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um endereco de entrega",
        path: ["address"],
      });
    }
  });

export const createOnlineOrderRequestSchema = z
  .object({
    address: checkoutAddressSchema.optional().nullable(),
    addressId: z.coerce.number().int().positive("Endereco invalido").optional().nullable(),
    deliveryMode: z.enum(["delivery", "pickup"]),
    items: z
      .array(
        z.object({
          notes: z.string().trim().max(500).optional().or(z.literal("")),
          productId: z.coerce.number().int().positive("Produto invalido"),
          quantity: z.coerce.number().int().min(1).max(99),
        }),
      )
      .min(1, "Informe ao menos um item"),
    storeId: z.coerce.number().int().positive("Loja invalida"),
  })
  .superRefine((data, context) => {
    if (data.deliveryMode === "delivery" && !data.addressId && !data.address) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um endereco de entrega",
        path: ["address"],
      });
    }
  });

export const createStoreOrderProposalSchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .min(100, "Informe um valor minimo de R$ 1,00")
    .max(999999999, "Valor acima do limite"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const payStoreOrderProposalSchema = z.object({
  balanceUsedCents: z.coerce.number().int().min(0).optional(),
  pixComplementCents: z.coerce.number().int().min(0).optional(),
  useBalance: z.boolean().optional(),
});

export const createOrderMessageSchema = z.object({
  ...chatAttachmentFields,
  message: z.string().trim().max(1200, "Mensagem muito longa").optional().or(z.literal("")),
}).superRefine(validateMessageAttachment);
