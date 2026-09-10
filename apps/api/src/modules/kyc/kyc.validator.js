import { z } from "zod";

export const submitKycSchema = z.object({
  documentType: z.enum(["RG", "CNH", "RNE"], {
    errorMap: () => ({ message: "Selecione RG, CNH ou RNE" }),
  }),
});

export const listKycSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(),
  status: z.enum(["EM_ANALISE", "APROVADO", "REPROVADO", "BLOQUEADO"]).optional(),
});

export const decideKycSchema = z.object({
  reason: z.string().trim().min(8, "Explique a decisao com pelo menos 8 caracteres").max(1000),
});
