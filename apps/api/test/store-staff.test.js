import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptStoreStaffInvite,
  createStoreStaffInvite,
} from "../src/modules/store-staff/store-staff.service.js";

const store = {
  banner_url: null,
  id: 10,
  logo_url: "/logo.png",
  nome: "Loja Teste",
  slug: "loja-teste",
  status: "ATIVA",
};

test("convite QR de funcionario guarda somente hash e retorna codigo de uso unico", async () => {
  let persistedData;
  const repository = {
    findOwnerStore: async () => store,
    transaction: async (work) => work({
      conviteFuncionarioLoja: {
        create: async ({ data }) => {
          persistedData = data;
          return {
            ...data,
            convidado: null,
            criado_em: new Date(),
            id: 1,
          };
        },
      },
    }),
  };

  const result = await createStoreStaffInvite(5, 10, {}, repository);
  const rawToken = result.qrValue.replace("BRASIL_CASHBACK:STORE_STAFF:", "");

  assert.match(result.qrValue, /^BRASIL_CASHBACK:STORE_STAFF:/);
  assert.equal(persistedData.token_hash.length, 64);
  assert.notEqual(persistedData.token_hash, rawToken);
  assert.equal(persistedData.cargo, "ATENDENTE");
});

test("convite nominal nao pode ser aceito por outra conta", async () => {
  const repository = {
    findInvite: async () => ({
      cargo: "ATENDENTE",
      convidado_usuario_id: 22,
      expira_em: new Date(Date.now() + 60_000),
      id: 4,
      loja: store,
      loja_id: store.id,
      status: "PENDENTE",
    }),
  };

  await assert.rejects(
    acceptStoreStaffInvite(99, { token: "BRASIL_CASHBACK:STORE_STAFF:token-comprido-e-valido" }, repository),
    /pertence a outra conta/,
  );
});

test("somente a primeira conta consegue consumir o mesmo convite QR", async () => {
  let memberCreated = false;
  const repository = {
    findInvite: async () => ({
      cargo: "ATENDENTE",
      convidado_usuario_id: null,
      expira_em: new Date(Date.now() + 60_000),
      id: 7,
      loja: store,
      loja_id: store.id,
      status: "PENDENTE",
    }),
    transaction: async (work) => work({
      conviteFuncionarioLoja: { updateMany: async () => ({ count: 0 }) },
      usuarioLoja: { upsert: async () => { memberCreated = true; } },
    }),
  };

  await assert.rejects(
    acceptStoreStaffInvite(30, { token: "BRASIL_CASHBACK:STORE_STAFF:token-comprido-e-valido" }, repository),
    /ja foi utilizado/,
  );
  assert.equal(memberCreated, false);
});
