import { z } from "zod";

export const payoutAccountSchema = z.object({
  // Campos antigos continuam aceitos durante a atualizacao dos APKs, mas o
  // titular sempre e obtido da conta autenticada no servidor.
  holderDocument: z.string().trim().max(18).optional(),
  holderName: z.string().trim().max(180).optional(),
  key: z.string().trim().max(255).optional().default(""),
  keyType: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]),
}).strict().superRefine((data, context) => {
  if (data.keyType !== "CPF" && data.key.length < 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe a chave Pix",
      path: ["key"],
    });
  }
});
