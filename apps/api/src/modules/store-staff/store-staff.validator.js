import { z } from "zod";

export const createStoreStaffInviteSchema = z.object({
  publicId: z.string().trim().max(80).optional().or(z.literal("")),
});

export const decideStoreStaffInviteSchema = z.object({
  invitationId: z.coerce.number().int().positive().optional(),
  token: z.string().trim().min(20).max(500).optional(),
}).refine((data) => Boolean(data.invitationId || data.token), {
  message: "Informe o convite ou token",
});
