import { z } from "zod";

export const chatAttachmentFields = {
  attachmentType: z.enum(["IMAGE", "VIDEO", "AUDIO", "LOCATION"]).optional(),
  durationMs: z.coerce.number().int().min(0).max(10 * 60 * 1000).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  locationLabel: z.string().trim().max(120).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
};

export function validateMessageAttachment(data, context) {
  if (!data.message && !data.attachmentType) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Escreva uma mensagem ou envie um anexo", path: ["message"] });
  }
  if (data.attachmentType === "LOCATION" && (data.latitude === undefined || data.longitude === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe uma localizacao valida", path: ["latitude"] });
  }
}
