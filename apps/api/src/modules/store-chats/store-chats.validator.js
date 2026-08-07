import { z } from "zod";

export const createStoreChatMessageSchema = z
  .object({
    message: z.string().trim().max(2000, "Mensagem muito longa").optional(),
    productId: z.coerce.number().int().positive().optional(),
    type: z
      .enum(["TEXTO", "PRODUTO", "CATEGORIA", "CATALOGO"])
      .default("TEXTO"),
  })
  .superRefine((data, context) => {
    if (data.type === "TEXTO" && !data.message) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Escreva uma mensagem",
        path: ["message"],
      });
    }

    if (data.type === "PRODUTO" && !data.productId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione um produto",
        path: ["productId"],
      });
    }
  });
