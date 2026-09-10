import { z } from "zod";

export const createWalletDepositSchema = z.object({
  amountCents: z.coerce.number().int().min(100, "O deposito minimo e R$ 1,00").max(5_000_000, "O deposito maximo por Pix e R$ 50.000,00"),
  idempotencyKey: z.string().trim().min(16).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Chave de idempotencia invalida"),
}).strict();
