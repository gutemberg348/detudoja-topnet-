import { z } from "zod";
import { isValidCpf, normalizeCpf } from "../../utils/cpf.js";

const onlyDigits = (value) => value.replace(/\D/g, "");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phonePattern = /^[1-9]{2}\d{8,9}$/;

const accountAddressSchema = z.object({
  city: z.string().trim().min(2, "Informe sua cidade").max(120),
  complement: z.string().trim().max(180).optional().or(z.literal("")),
  district: z.string().trim().min(2, "Informe seu bairro").max(120),
  number: z.string().trim().min(1, "Informe o numero").max(30),
  reference: z.string().trim().max(255).optional().or(z.literal("")),
  state: z.string().trim().length(2, "Informe a UF").transform((value) => value.toUpperCase()),
  street: z.string().trim().min(2, "Informe sua rua").max(180),
  zipCode: z.string().transform(onlyDigits).refine((value) => value.length === 8, "CEP invalido"),
});

export const loginSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, "Informe o e-mail ou telefone")
    .transform((value) =>
      emailPattern.test(value.toLowerCase())
        ? value.toLowerCase()
        : onlyDigits(value),
    )
    .refine(
      (value) => emailPattern.test(value) || phonePattern.test(value),
      "E-mail ou telefone invalido",
    ),
  password: z.string().min(1, "Informe a senha").max(72, "Senha muito longa"),
});

export const socialLoginSchema = z.object({
  idToken: z.string().trim().min(20, "Token social invalido").max(12000),
  name: z.string().trim().min(1).max(160).optional(),
  provider: z.enum(["GOOGLE", "APPLE"]),
});

export const registrationSchema = z.object({
  address: accountAddressSchema,
  email: z.string().trim().toLowerCase().email("E-mail invalido").max(255),
  inviteCode: z.string().trim().toUpperCase().max(40).optional(),
  storeSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Loja de origem invalida")
    .max(180)
    .optional(),
  name: z.string().trim().min(3, "Informe o nome completo").max(160),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(72, "Senha muito longa")
    .regex(/[a-z]/i, "A senha deve conter uma letra")
    .regex(/\d/, "A senha deve conter um numero"),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((value) => phonePattern.test(value), "Telefone invalido"),
});

export const completeCpfSchema = z.object({
  cpf: z
    .string()
    .transform(normalizeCpf)
    .refine(isValidCpf, "CPF invalido"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(72, "Senha muito longa")
  .regex(/[a-z]/i, "A senha deve conter uma letra")
  .regex(/\d/, "A senha deve conter um numero");

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalido").max(255),
});

export const passwordResetConfirmSchema = z.object({
  password: passwordSchema,
  token: z.string().trim().min(32, "Link de recuperacao invalido").max(512),
});
