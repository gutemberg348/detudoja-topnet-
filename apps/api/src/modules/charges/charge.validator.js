import { z } from "zod";

export const createStoreChargeSchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .min(100, "Informe um valor minimo de R$ 1,00")
    .max(999999999, "Valor acima do limite"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  title: z.string().trim().min(2, "Informe a descricao da cobranca").max(180).optional(),
});

export const payChargeSchema = z.object({}).strict();
