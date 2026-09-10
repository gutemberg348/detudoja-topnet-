import { z } from "zod";

const walletCodeSchema = z.enum(["saldo_pix", "cashback", "rede", "vendas"]);

export const requestWithdrawalSchema = z.object({
  amountCents: z.coerce.number().int().positive("Informe um valor de saque valido"),
  idempotencyKey: z.string().trim().min(12).max(100),
  walletCode: walletCodeSchema.optional(),
  walletSources: z.array(z.object({
    amountCents: z.coerce.number().int().positive(),
    walletCode: walletCodeSchema,
  }).strict()).min(1).max(3).optional(),
}).strict().superRefine((value, context) => {
  if (!value.walletCode && !value.walletSources?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Selecione ao menos uma carteira" });
  }

  if (value.walletSources?.length) {
    const sourceTotal = value.walletSources.reduce((total, source) => total + source.amountCents, 0);
    if (sourceTotal !== value.amountCents) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "As origens precisam somar o valor total do saque" });
    }
    if (new Set(value.walletSources.map((source) => source.walletCode)).size !== value.walletSources.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Uma carteira nao pode ser repetida no mesmo saque" });
    }
  }
});

export const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(8, "Informe o motivo da recusa").max(500),
}).strict();

export const updateWithdrawalSettingsSchema = z.object({
  dailyLimitCents: z.coerce.number().int().positive(),
  enabled: z.coerce.boolean(),
  fixedFeeCents: z.coerce.number().int().min(0),
  manualApproval: z.coerce.boolean(),
  maximumCents: z.coerce.number().int().positive(),
  minimumCents: z.coerce.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.maximumCents < value.minimumCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "O maximo deve ser maior ou igual ao minimo" });
  }
  if (value.dailyLimitCents < value.maximumCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "O limite diario deve ser maior ou igual ao maximo por saque" });
  }
  if (value.fixedFeeCents >= value.minimumCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A taxa deve ser menor que o saque minimo" });
  }
});
