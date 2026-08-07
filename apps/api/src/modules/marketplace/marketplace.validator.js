import { z } from "zod";

const optionalPositiveInt = (message) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return value;
  }, z.coerce.number().int().positive(message).optional());

export const marketplaceStoresQuerySchema = z.object({
  categoryId: optionalPositiveInt("Categoria invalida"),
  search: z.string().trim().max(120).optional(),
});

export const marketplaceProductsQuerySchema = z.object({
  categoryId: optionalPositiveInt("Categoria invalida"),
  search: z.string().trim().max(120).optional(),
});

export const marketplaceSuggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  search: z.string().trim().max(120).optional(),
});
