import { z } from "zod";

export const payoutAccountSchema = z.object({
  holderDocument: z.string().trim().min(11).max(18),
  holderName: z.string().trim().min(2).max(180),
  key: z.string().trim().min(3).max(255),
  keyType: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]),
}).strict();
