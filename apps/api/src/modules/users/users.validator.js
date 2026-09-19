import { z } from "zod";

const onlyDigits = (value) => value.replace(/\D/g, "");

const addressSchema = z.object({
  city: z.string().trim().min(2, "Informe sua cidade").max(120),
  complement: z.string().trim().max(180).optional().or(z.literal("")),
  district: z.string().trim().min(2, "Informe seu bairro").max(120),
  number: z.string().trim().min(1, "Informe o numero").max(30),
  reference: z.string().trim().max(255).optional().or(z.literal("")),
  state: z.string().trim().length(2, "Informe a UF").transform((value) => value.toUpperCase()),
  street: z.string().trim().min(2, "Informe sua rua").max(180),
  zipCode: z.string().transform(onlyDigits).refine((value) => value.length === 8, "CEP invalido"),
});

const locationSchema = z.object({
  city: z.string().trim().min(2, "Informe sua cidade").max(120),
  state: z.string().trim().length(2, "Informe a UF").transform((value) => value.toUpperCase()),
});

export const updateCurrentUserSchema = z
  .object({
    address: addressSchema.optional(),
    email: z.string().trim().toLowerCase().email("E-mail invalido").max(255).optional(),
    location: locationSchema.optional(),
    name: z.string().trim().min(3, "Informe o nome completo").max(160).optional(),
    phone: z
      .string()
      .transform(onlyDigits)
      .refine((value) => /^[1-9]{2}\d{8,9}$/.test(value), "Telefone invalido")
      .optional(),
    professionalProfileActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe um campo para atualizar");
