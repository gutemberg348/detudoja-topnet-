import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

let baseUrl;
let server;
const testAccount = {
  address: {
    city: "Patos",
    district: "Centro",
    number: "100",
    state: "PB",
    street: "Rua Principal",
    zipCode: "58700000",
  },
  cpf: "52998224725",
  email: "auth-test@detudoja.local",
  name: "Usuario Auth Teste",
  password: "senha123",
  phone: "11977776666",
};
const networkChildren = [
  {
    cpf: "11144477735",
    email: "network-child-1@detudoja.local",
    name: "Conexao Verificada Um",
    phone: "11966665555",
  },
  {
    cpf: "12345678909",
    email: "network-child-2@detudoja.local",
    name: "Conexao Verificada Dois",
    phone: "11955554444",
  },
];
const adminTestCategoryName = "Categoria Teste Admin";
const testAdmin = {
  email: "admin-auth-test@detudoja.local",
  name: "Administrador Teste",
  password: "senha-admin-123",
  phone: "11944443333",
};

async function createTestAdmin() {
  await prisma.administrador.deleteMany({
    where: { email: testAdmin.email },
  });
  const passwordHash = await argon2.hash(testAdmin.password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
  await prisma.administrador.create({
    data: {
      email: testAdmin.email,
      nome: testAdmin.name,
      papel: "SUPER_ADMIN",
      senha_hash: passwordHash,
      status: "ATIVO",
      telefone: testAdmin.phone,
    },
  });
}

async function deleteTestAdmin() {
  await prisma.administrador.deleteMany({
    where: { email: testAdmin.email },
  });
}

async function deleteAdminTestCategory() {
  await prisma.categoriaLoja.deleteMany({
    where: { nome: adminTestCategoryName },
  });
}

async function deleteTestAccount() {
  const testEmails = [testAccount.email, ...networkChildren.map((item) => item.email)];
  const testPhones = [testAccount.phone, ...networkChildren.map((item) => item.phone)];
  const users = await prisma.usuario.findMany({
    select: { id: true },
    where: {
      OR: [{ email: { in: testEmails } }, { telefone: { in: testPhones } }],
    },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.indicacao.deleteMany({
      where: {
        OR: [
          { indicado_usuario_id: { in: userIds } },
          { indicador_usuario_id: { in: userIds } },
        ],
      },
    }),
    prisma.codigoConvite.deleteMany({
      where: { usuario_id: { in: userIds } },
    }),
    prisma.lancamentoCarteira.deleteMany({
      where: { usuario_id: { in: userIds } },
    }),
    prisma.carteira.deleteMany({
      where: { usuario_id: { in: userIds } },
    }),
    prisma.usuario.deleteMany({
      where: { id: { in: userIds } },
    }),
  ]);
}

before(
  async () => {
    await prisma.$connect();
    await deleteTestAccount();
    await deleteAdminTestCategory();
    await createTestAdmin();

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  },
);

after(
  async () => {
    await deleteTestAccount();
    await deleteAdminTestCategory();
    await deleteTestAdmin();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await prisma.$disconnect();
  },
);

async function request(path, { body, method, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method: method ?? (body ? "POST" : "GET"),
  });
  const data = response.status === 204 ? null : await response.json();

  return { data, status: response.status };
}

function loginBody() {
  return {
    login: testAdmin.email,
    password: testAdmin.password,
  };
}

function registrationBody() {
  const { cpf: _cpf, ...data } = testAccount;
  return data;
}

test("health check remains public", async () => {
  const response = await request("/health");

  assert.equal(response.status, 200);
  assert.equal(response.data.status, "ok");
});

test("business routes reject requests without access token", async () => {
  const appResponse = await request("/api/app/wallets");
  const adminResponse = await request("/api/admin/dashboard");

  assert.equal(appResponse.status, 401);
  assert.equal(adminResponse.status, 401);
});

test("app registration creates a user and starts a session", async () => {
  const registerResponse = await request("/api/app/auth/register", {
    body: registrationBody(),
  });
  const meResponse = await request("/api/app/auth/me", {
    token: registerResponse.data.accessToken,
  });
  const storedUser = await prisma.usuario.findUnique({
    include: {
      carteiras: { include: { tipo_carteira: true } },
      kyc: true,
    },
    where: { email: testAccount.email },
  });

  assert.equal(registerResponse.status, 201);
  assert.equal(registerResponse.data.user.role, "customer");
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.data.user.email, testAccount.email);
  assert.equal(storedUser.telefone, testAccount.phone);
  assert.equal(storedUser.cpf, null);
  assert.equal(storedUser.kyc.status, "PENDENTE");
  assert.equal(registerResponse.data.user.cpfRequired, true);
  assert.deepEqual(
    storedUser.carteiras.map((wallet) => wallet.tipo_carteira.codigo).sort(),
    ["cashback", "rede", "saldo_pix", "vendas"],
  );
  assert.ok(
    storedUser.carteiras.every(
      (wallet) =>
        wallet.saldo_disponivel_centavos === 0n &&
        wallet.saldo_pendente_centavos === 0n &&
        wallet.saldo_bloqueado_centavos === 0n,
    ),
  );
  assert.notEqual(storedUser.senha_hash, testAccount.password);
  assert.equal("senha_hash" in registerResponse.data.user, false);
});

test("app login accepts a database user email", async () => {
  const response = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.user.email, testAccount.email);
});

test("app login accepts the database user phone with formatting", async () => {
  const phone = testAccount.phone;
  const response = await request("/api/app/auth/login", {
    body: {
      login: `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`,
      password: testAccount.password,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.user.phone, testAccount.phone);
});

test("CPF is completed in the mandatory post-registration step", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const response = await request("/api/app/auth/complete-cpf", {
    body: { cpf: testAccount.cpf },
    token: loginResponse.data.accessToken,
  });
  const storedUser = await prisma.usuario.findUnique({
    include: { kyc: true },
    where: { email: testAccount.email },
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.user.cpfRequired, false);
  assert.equal(storedUser.cpf, testAccount.cpf);
  assert.equal(storedUser.kyc.cpf, testAccount.cpf);
});

test("wallet overview returns four zeroed database wallets", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const response = await request("/api/app/wallets", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.data.wallets.map((wallet) => wallet.code).sort(),
    ["cashback", "rede", "saldo_pix", "vendas"],
  );
  assert.equal(response.data.summary.totalCents, 0);
  assert.ok(response.data.wallets.every((wallet) => wallet.totalCents === 0));
});

test("wallet detail is scoped to the authenticated user", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const response = await request("/api/app/wallets/cashback", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.wallet.code, "cashback");
  assert.equal(response.data.wallet.availableCents, 0);
});

test("profile reads and updates database user data", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const profileResponse = await request("/api/app/users/me", {
    token: loginResponse.data.accessToken,
  });
  const updateResponse = await request("/api/app/users/me", {
    body: { name: "Usuario Atualizado" },
    method: "PATCH",
    token: loginResponse.data.accessToken,
  });
  const sessionResponse = await request("/api/app/auth/me", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(profileResponse.status, 200);
  assert.equal(profileResponse.data.user.email, testAccount.email);
  assert.equal(profileResponse.data.user.cpf, "***.***.***-25");
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.data.user.name, "Usuario Atualizado");
  assert.equal(sessionResponse.data.user.name, "Usuario Atualizado");
  assert.equal("senha_hash" in updateResponse.data.user, false);
});

test("network qualification requires two active KYC-approved directs", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const initialNetwork = await request("/api/app/network", {
    token: loginResponse.data.accessToken,
  });
  const parent = await prisma.usuario.findUnique({
    where: { email: testAccount.email },
  });
  const invite = await prisma.codigoConvite.findUnique({
    where: { codigo: initialNetwork.data.invite.code },
  });

  await prisma.kycUsuario.update({
    data: { status: "APROVADO", validado_em: new Date() },
    where: { usuario_id: parent.id },
  });

  for (const childData of networkChildren) {
    const child = await prisma.usuario.create({
      data: {
        cpf: childData.cpf,
        email: childData.email,
        kyc: {
          create: {
            cpf: childData.cpf,
            nome_completo: childData.name,
            status: "APROVADO",
            tipo_pessoa: "FISICA",
            validado_em: new Date(),
          },
        },
        nome: childData.name,
        senha_hash: "test-only-not-a-login-hash",
        status: "ATIVO",
        telefone: childData.phone,
      },
    });
    await prisma.indicacao.create({
      data: {
        alocado_sob_usuario_id: parent.id,
        codigo_convite_id: invite.id,
        indicado_usuario_id: child.id,
        indicador_usuario_id: parent.id,
        nivel_matriz: 1,
        origem: "teste_integracao",
        posicao_matriz: networkChildren.indexOf(childData) + 1,
        status: "ATIVA",
        tipo_indicacao: "CONSUMIDOR",
      },
    });
  }

  const qualifiedNetwork = await request("/api/app/network", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(initialNetwork.status, 200);
  assert.equal(qualifiedNetwork.status, 200);
  assert.equal(qualifiedNetwork.data.summary.active, 2);
  assert.equal(qualifiedNetwork.data.summary.verified, 2);
  assert.equal(qualifiedNetwork.data.qualification.activeVerifiedDirects, 2);
  assert.equal(qualifiedNetwork.data.qualification.qualified, true);
  assert.equal(qualifiedNetwork.data.matrix.width, 2);
  assert.equal(qualifiedNetwork.data.matrix.maxDepth, 20);
  assert.equal(qualifiedNetwork.data.matrix.levels[0].left, 1);
  assert.equal(qualifiedNetwork.data.matrix.levels[0].right, 1);
});

test("app registration rejects duplicate email or phone", async () => {
  const response = await request("/api/app/auth/register", {
    body: registrationBody(),
  });

  assert.equal(response.status, 409);
});

test("app registration rejects invalid fields", async () => {
  const response = await request("/api/app/auth/register", {
    body: {
      email: "email-invalido",
      name: "A",
      password: "123",
      phone: "123",
    },
  });

  assert.equal(response.status, 400);
  assert.ok(response.data.details.fieldErrors.email);
  assert.ok(response.data.details.fieldErrors.phone);
});

test("admin tokens work only in the admin audience", async () => {
  const loginResponse = await request("/api/admin/auth/login", {
    body: loginBody(),
  });
  const adminResponse = await request("/api/admin/dashboard", {
    token: loginResponse.data.accessToken,
  });
  const appResponse = await request("/api/app/wallets", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(adminResponse.status, 200);
  assert.equal(appResponse.status, 401);
});

test("admin dashboard and participant list use database data", async () => {
  const loginResponse = await request("/api/admin/auth/login", {
    body: loginBody(),
  });
  const dashboardResponse = await request("/api/admin/dashboard", {
    token: loginResponse.data.accessToken,
  });
  const usersResponse = await request("/api/admin/users", {
    token: loginResponse.data.accessToken,
  });

  assert.equal(dashboardResponse.status, 200);
  assert.equal(typeof dashboardResponse.data.participants.total, "number");
  assert.equal(Array.isArray(dashboardResponse.data.recentParticipants), true);
  assert.equal(usersResponse.status, 200);
  assert.equal(Array.isArray(usersResponse.data.users), true);
  assert.equal(typeof usersResponse.data.pagination.total, "number");
});

test("admin manages store categories", async () => {
  const loginResponse = await request("/api/admin/auth/login", {
    body: loginBody(),
  });
  const createResponse = await request("/api/admin/categories", {
    body: {
      description: "Criada pelo teste de integracao",
      name: adminTestCategoryName,
      status: "ATIVA",
    },
    token: loginResponse.data.accessToken,
  });
  const categoryId = createResponse.data.category.id;
  const updateResponse = await request(`/api/admin/categories/${categoryId}`, {
    body: { status: "INATIVA" },
    method: "PATCH",
    token: loginResponse.data.accessToken,
  });
  const listResponse = await request("/api/admin/categories", {
    token: loginResponse.data.accessToken,
  });
  const deleteResponse = await request(`/api/admin/categories/${categoryId}`, {
    method: "DELETE",
    token: loginResponse.data.accessToken,
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.data.category.name, adminTestCategoryName);
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.data.category.status, "INATIVA");
  assert.ok(listResponse.data.categories.some((item) => item.id === categoryId));
  assert.equal(deleteResponse.status, 204);
});

test("refresh tokens rotate a session within the same audience", async () => {
  const loginResponse = await request("/api/admin/auth/login", {
    body: loginBody(),
  });
  const refreshResponse = await request("/api/admin/auth/refresh", {
    body: { refreshToken: loginResponse.data.refreshToken },
  });
  const meResponse = await request("/api/admin/auth/me", {
    token: refreshResponse.data.accessToken,
  });

  assert.equal(refreshResponse.status, 200);
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.data.user.role, "super_admin");
});

test("refresh token cannot be reused after rotation or logout", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const firstRefresh = await request("/api/app/auth/refresh", {
    body: { refreshToken: loginResponse.data.refreshToken },
  });
  const reusedRefresh = await request("/api/app/auth/refresh", {
    body: { refreshToken: loginResponse.data.refreshToken },
  });
  const logoutResponse = await request("/api/app/auth/logout", {
    body: { refreshToken: firstRefresh.data.refreshToken },
    token: firstRefresh.data.accessToken,
  });
  const loggedOutRefresh = await request("/api/app/auth/refresh", {
    body: { refreshToken: firstRefresh.data.refreshToken },
  });

  assert.equal(firstRefresh.status, 200);
  assert.equal(reusedRefresh.status, 401);
  assert.equal(logoutResponse.status, 204);
  assert.equal(loggedOutRefresh.status, 401);
});

test("app refresh keeps the database user session", async () => {
  const loginResponse = await request("/api/app/auth/login", {
    body: { login: testAccount.email, password: testAccount.password },
  });
  const refreshResponse = await request("/api/app/auth/refresh", {
    body: { refreshToken: loginResponse.data.refreshToken },
  });

  assert.equal(refreshResponse.status, 200);
  assert.equal(refreshResponse.data.user.id, loginResponse.data.user.id);
});

test("invalid credentials are rejected", async () => {
  const response = await request("/api/app/auth/login", {
    body: {
      login: testAccount.email,
      password: "invalid-password",
    },
  });

  assert.equal(response.status, 401);
});
