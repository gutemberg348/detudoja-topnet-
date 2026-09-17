import { z } from "zod";
import { chatAttachmentFields, validateMessageAttachment } from "../chat-media/chat-media.validator.js";

const multipartBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const createStoreChatMessageSchema = z
  .object({
    ...chatAttachmentFields,
    message: z.string().trim().max(2000, "Mensagem muito longa").optional(),
    searchCatalog: multipartBoolean.optional().default(false),
    productId: z.coerce.number().int().positive().optional(),
    support: multipartBoolean.optional().default(false),
    type: z
      .enum(["TEXTO", "PRODUTO", "CATEGORIA", "CATALOGO"])
      .default("TEXTO"),
  })
  .superRefine((data, context) => {
    if (data.type === "TEXTO") validateMessageAttachment(data, context);

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
