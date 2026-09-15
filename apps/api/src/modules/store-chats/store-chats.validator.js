import { z } from "zod";

export const createStoreChatMessageSchema = z
  .object({
    message: z.string().trim().max(2000, "Mensagem muito longa").optional(),
    productId: z.coerce.number().int().positive().optional(),
    support: z.boolean().optional().default(false),
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

export const storeChatActivitySchema = z.object({
  action: z.enum(["VIEW_PRODUCT", "ADD_TO_CART", "START_CHECKOUT"]),
  productId: z.coerce.number().int().positive().optional(),
}).superRefine((data, context) => {
  if (["VIEW_PRODUCT", "ADD_TO_CART"].includes(data.action) && !data.productId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecione o produto",
      path: ["productId"],
    });
  }
});
