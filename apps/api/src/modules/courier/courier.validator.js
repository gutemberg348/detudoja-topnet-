import { z } from "zod";

const platePattern = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export const addStoreCourierSchema = z.object({
  contactPhone: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length >= 10 && value.length <= 11,
    "Informe o telefone cadastrado pelo profissional",
  ),
});

export const saveCourierProfileSchema = z.object({
  baseCity: z.string().trim().min(2, "Informe sua cidade").max(120),
  baseState: z.string().trim().length(2, "Informe a UF com 2 letras").transform((value) => value.toUpperCase()),
  color: z.string().trim().min(2, "Informe a cor do veiculo").max(60),
  contactPhone: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length >= 10 && value.length <= 11,
    "Informe um telefone valido",
  ),
  displayName: z.string().trim().min(2, "Informe seu nome profissional").max(180),
  driverLicense: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine(
    (value) => value.length === 11,
    "Informe uma CNH valida",
  ),
  plate: z.string().trim().transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")).refine(
    (value) => platePattern.test(value),
    "Informe uma placa valida",
  ),
  serviceRadiusKm: z.coerce.number().int().min(1).max(100),
  vehicleModel: z.string().trim().min(2, "Informe o modelo do veiculo").max(120),
});

export const createCourierRequestSchema = z.object({
  description: z.string().trim().max(1200).optional().default(""),
  destination: z.string().trim().min(5, "Informe o destino").max(300),
  orderId: z.coerce.number().int().positive().optional(),
  origin: z.string().trim().min(5, "Informe o local da retirada").max(300),
  serviceTypeId: z.coerce.number().int().positive("Servico invalido").optional(),
  teamMemberId: z.coerce.number().int().positive().optional(),
});

export const createCustomerCourierRequestSchema = z.object({
  description: z.string().trim().max(1200).optional().default(""),
  destination: z.string().trim().max(300).optional().default(""),
  origin: z.string().trim().max(300).optional().default(""),
  serviceTypeId: z.coerce.number().int().positive("Servico invalido"),
});

export const updateCourierDispatchScopeSchema = z.object({
  acceptsPlatformCalls: z.boolean(),
});
