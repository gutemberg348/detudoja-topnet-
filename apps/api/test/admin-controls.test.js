import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjustAdminUserWalletSchema,
  createAdminServiceTypeSchema,
  createAdministratorSchema,
  moveAdminNetworkPlacementSchema,
  updateAdminNetworkEarningsSchema,
  updateAdminWalletTypeSchema,
} from "../src/modules/admin/admin.validator.js";
import { updateSellerServiceSchema } from "../src/modules/service-chats/service-chats.validator.js";
import { isQualifiedForNetwork } from "../src/modules/network/network.qualification.js";

test("administrator registration requires a valid role and strong initial password", () => {
  assert.equal(createAdministratorSchema.safeParse({
    email: "novo-admin@brasilcashback.local",
    name: "Novo Administrador",
    password: "senha-inicial-segura",
    phone: "11999990000",
    role: "FINANCEIRO",
  }).success, true);
  assert.equal(createAdministratorSchema.safeParse({
    email: "email-invalido",
    name: "Admin",
    password: "curta",
    role: "DONO",
  }).success, false);
});

test("admin wallet adjustment requires an explicit operation and reason", () => {
  const debit = adjustAdminUserWalletSchema.safeParse({
    description: "Correcao autorizada do saldo duplicado",
    operation: "DEBIT",
    valueCents: 1500,
    walletCode: "vendas",
  });
  const invalid = adjustAdminUserWalletSchema.safeParse({
    description: "ajuste",
    operation: "REMOVE",
    valueCents: 1500,
    walletCode: "vendas",
  });

  assert.equal(debit.success, true);
  assert.equal(invalid.success, false);
});

test("wallet withdrawal policy accepts only a boolean flag", () => {
  assert.equal(updateAdminWalletTypeSchema.safeParse({ canWithdraw: true }).success, true);
  assert.equal(updateAdminWalletTypeSchema.safeParse({ canWithdraw: "yes" }).success, false);
});

test("network movement accepts only binary positions with a reason", () => {
  const valid = moveAdminNetworkPlacementSchema.safeParse({
    parentUserId: 10,
    position: 2,
    reason: "Correcao operacional aprovada",
  });
  const invalid = moveAdminNetworkPlacementSchema.safeParse({
    parentUserId: 10,
    position: 3,
    reason: "curto",
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("network earnings control requires an explicit state and auditable reason", () => {
  assert.equal(updateAdminNetworkEarningsSchema.safeParse({
    blocked: true,
    reason: "Suspeita operacional em revisao",
  }).success, true);
  assert.equal(updateAdminNetworkEarningsSchema.safeParse({
    blocked: "true",
    reason: "curto",
  }).success, false);
});

test("an administrative earnings block removes network qualification", () => {
  const user = {
    ganhos_rede_bloqueados: true,
    indicacoes_feitas: [
      { indicado: { kyc: { status: "APROVADO" }, status: "ATIVO" } },
      { indicado: { kyc: { status: "APROVADO" }, status: "ATIVO" } },
    ],
    kyc: { status: "APROVADO" },
    status: "ATIVO",
  };

  assert.equal(isQualifiedForNetwork(user), false);
  assert.equal(isQualifiedForNetwork({ ...user, ganhos_rede_bloqueados: false }), true);
});

test("admin configures the registration required by each service", () => {
  const motoboy = createAdminServiceTypeSchema.safeParse({
    name: "Motoboy",
    operationalType: "ENTREGA_LOCAL",
    registrationRequirements: {
      requiresDriverLicense: true,
      requiresPlate: true,
      requiresVehicle: true,
      vehicleKinds: ["MOTO"],
    },
    segmentId: 1,
  });
  const invalidVehicle = createAdminServiceTypeSchema.safeParse({
    name: "Entrega espacial",
    registrationRequirements: {
      requiresVehicle: true,
      vehicleKinds: [],
    },
    segmentId: 1,
  });

  assert.equal(motoboy.success, true);
  assert.equal(invalidVehicle.success, false);
});

test("provider registration accepts only the configured vehicle vocabulary", () => {
  assert.equal(updateSellerServiceSchema.safeParse({
    available: true,
    registration: {
      color: "Branca",
      driverLicense: "12345678901",
      plate: "ABC1D23",
      vehicleKind: "UTILITARIO",
      vehicleModel: "Fiat Fiorino",
    },
    serviceTypeId: 2,
  }).success, true);
  assert.equal(updateSellerServiceSchema.safeParse({
    available: true,
    registration: { vehicleKind: "BARCO" },
    serviceTypeId: 2,
  }).success, false);
});
