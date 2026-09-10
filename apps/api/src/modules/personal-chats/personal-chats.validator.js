import { z } from "zod";

export const createFriendInvitationSchema = z.object({
  publicId: z
    .string()
    .trim()
    .min(3, "Informe o ID do amigo")
    .max(80, "ID invalido"),
});

export const lookupPersonalContactSchema = z.object({
  publicId: z
    .string()
    .trim()
    .min(3, "Informe o ID do contato")
    .max(160, "ID invalido"),
});

export const updateFriendAliasSchema = z.object({
  alias: z
    .string()
    .trim()
    .max(80, "Apelido muito longo")
    .nullable(),
});

export const createPersonalMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Escreva uma mensagem")
    .max(2000, "Mensagem muito longa"),
});
