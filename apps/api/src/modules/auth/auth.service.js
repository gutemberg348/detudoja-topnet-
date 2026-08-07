import { randomUUID } from "crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { addressData } from "../../utils/location.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { findStoreSignupSource } from "./store-signup.service.js";
import { ensureUserWallets } from "../wallet/wallet.service.js";

export const authAudiences = {
  admin: "detudoja-admin",
  app: "detudoja-app",
};

const enabledStatuses = new Set(["ATIVO", "PENDENTE"]);
const appUserInclude = {
  kyc: true,
  lojista: true,
  vendedor: true,
};

function toPublicAdmin(admin) {
  return {
    accountType: "ADMIN",
    cpfRequired: false,
    email: admin.email,
    id: admin.id,
    name: admin.nome,
    phone: admin.telefone,
    role: admin.papel.toLowerCase(),
    status: admin.status,
  };
}

function toPublicUser(user) {
  const capabilities = {
    customer: true,
    merchant: Boolean(user.lojista && !user.lojista.excluido_em),
    seller: Boolean(user.vendedor && !user.vendedor.excluido_em),
  };
  const roles = [
    "customer",
    ...(capabilities.merchant ? ["merchant"] : []),
    ...(capabilities.seller ? ["seller"] : []),
  ];

  return {
    accountType: user.tipo_conta,
    capabilities,
    cpfRequired: !user.cpf,
    email: user.email,
    id: user.id,
    kycLevel: user.nivel_kyc,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    name: user.nome,
    phone: user.telefone,
    role: roles[0],
    roles,
    status: user.status,
  };
}

function signToken({ audience, expiresIn, secret, tokenType, user }) {
  return jwt.sign(
    {
      accountType: user.accountType,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      roles: user.roles,
      capabilities: user.capabilities,
      status: user.status,
      tokenType,
    },
    secret,
    {
      audience,
      expiresIn,
      issuer: env.jwt.issuer,
      subject: String(user.id),
    },
  );
}

function parseJwtSubject(subject) {
  const id = Number(subject);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Token invalido", 401);
  }

  return id;
}

function createSession(audience, user) {
  return {
    accessToken: signToken({
      audience,
      expiresIn: env.jwt.accessExpiresIn,
      secret: env.jwt.accessSecret,
      tokenType: "access",
      user,
    }),
    expiresIn: env.jwt.accessExpiresIn,
    refreshToken: signToken({
      audience,
      expiresIn: env.jwt.refreshExpiresIn,
      secret: env.jwt.refreshSecret,
      tokenType: "refresh",
      user,
    }),
    tokenType: "Bearer",
    user,
  };
}

function verifyToken({ audience, expectedType, secret, token }) {
  try {
    const payload = jwt.verify(token, secret, {
      audience,
      issuer: env.jwt.issuer,
    });

    if (
      typeof payload === "string" ||
      payload.tokenType !== expectedType ||
      !payload.sub
    ) {
      throw new AppError("Token invalido", 401);
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Token invalido ou expirado", 401);
  }
}

function duplicateRegistrationError(existingUser, { email, phone }) {
  if (existingUser.email === email) {
    return new AppError("Este e-mail ja esta cadastrado", 409);
  }

  return new AppError("Este telefone ja esta cadastrado", 409);
}

async function findAppUser(loginValue) {
  return loginValue.includes("@")
    ? prisma.usuario.findUnique({ include: appUserInclude, where: { email: loginValue } })
    : prisma.usuario.findUnique({ include: appUserInclude, where: { telefone: loginValue } });
}

async function findAdmin(loginValue) {
  return loginValue.includes("@")
    ? prisma.administrador.findUnique({ where: { email: loginValue } })
    : prisma.administrador.findUnique({ where: { telefone: loginValue } });
}

async function verifyPassword(passwordHash, password) {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

async function ensureCompanyRootUser(database) {
  const email = env.companyRoot.email.trim().toLowerCase();
  const existingUser = await database.usuario.findUnique({
    where: { email },
  });

  if (existingUser) {
    return existingUser;
  }

  const passwordHash = await argon2.hash(randomUUID(), {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  return database.usuario.create({
    data: {
      email,
      email_verificado: true,
      kyc: {
        create: {
          nome_fantasia: env.companyRoot.name,
          razao_social: env.companyRoot.name,
          status: "APROVADO",
          tipo_pessoa: "JURIDICA",
        },
      },
      nome: env.companyRoot.name,
      senha_hash: passwordHash,
      status: "ATIVO",
      tipo_conta: "ADMIN",
    },
  });
}

async function findMatrixPlacement(database, sponsorUserId) {
  const sponsorPlacement = await database.indicacao.findUnique({
    select: { nivel_matriz: true },
    where: { indicado_usuario_id: sponsorUserId },
  });
  const queue = [
    {
      depthFromSponsor: 0,
      matrixLevel: sponsorPlacement?.nivel_matriz ?? 0,
      userId: sponsorUserId,
    },
  ];

  while (queue.length > 0) {
    const node = queue.shift();

    if (node.depthFromSponsor >= 20) {
      continue;
    }

    const children = await database.indicacao.findMany({
      orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
      select: {
        indicado_usuario_id: true,
        nivel_matriz: true,
        posicao_matriz: true,
      },
      where: {
        status: { in: ["ATIVA", "CONVERTIDA", "PENDENTE"] },
        OR: [
          { alocado_sob_usuario_id: node.userId },
          {
            alocado_sob_usuario_id: null,
            indicador_usuario_id: node.userId,
          },
        ],
      },
    });
    const occupiedPositions = new Set(
      children.map((child, index) => child.posicao_matriz ?? index + 1),
    );
    const position = [1, 2].find((candidate) => !occupiedPositions.has(candidate));

    if (position) {
      return {
        level: node.matrixLevel + 1,
        parentUserId: node.userId,
        position,
      };
    }

    for (const child of children) {
      queue.push({
        depthFromSponsor: node.depthFromSponsor + 1,
        matrixLevel: child.nivel_matriz ?? node.matrixLevel + 1,
        userId: child.indicado_usuario_id,
      });
    }
  }

  throw new AppError("A matriz 2x20 desta rede esta completa", 409);
}

export async function login({ audience, login: loginValue, password }) {
  if (audience === authAudiences.admin) {
    const admin = await findAdmin(loginValue);
    const passwordMatches = admin
      ? await verifyPassword(admin.senha_hash, password)
      : false;

    if (!admin || !passwordMatches) {
      throw new AppError("E-mail, telefone ou senha invalidos", 401);
    }

    if (admin.status !== "ATIVO" || admin.excluido_em) {
      throw new AppError("Esta conta administrativa nao esta disponivel", 403);
    }

    const updatedAdmin = await prisma.administrador.update({
      data: { ultimo_login_em: new Date() },
      where: { id: admin.id },
    });

    return createSession(audience, toPublicAdmin(updatedAdmin));
  }

  const user = await findAppUser(loginValue);
  const passwordMatches = user
    ? await verifyPassword(user.senha_hash, password)
    : false;

  if (!user || !passwordMatches) {
    throw new AppError("E-mail, telefone ou senha invalidos", 401);
  }

  if (!enabledStatuses.has(user.status)) {
    throw new AppError("Esta conta nao esta disponivel para acesso", 403);
  }

  await ensureUserWallets(user.id);

  const updatedUser = await prisma.usuario.update({
    data: { ultimo_login_em: new Date() },
    include: appUserInclude,
    where: { id: user.id },
  });

  return createSession(audience, toPublicUser(updatedUser));
}

export async function register({
  address,
  audience,
  email,
  inviteCode,
  name,
  password,
  phone,
  storeSlug,
}) {
  if (audience !== authAudiences.app) {
    throw new AppError("Cadastro nao permitido para esta aplicacao", 403);
  }

  if (email.trim().toLowerCase() === env.companyRoot.email.trim().toLowerCase()) {
    throw new AppError("Este e-mail ja esta cadastrado", 409);
  }

  const existingUser = await prisma.usuario.findFirst({
    where: { OR: [{ email }, { telefone: phone }] },
  });

  if (existingUser) {
    throw duplicateRegistrationError(existingUser, { email, phone });
  }

  const invitation = inviteCode
    ? await prisma.codigoConvite.findFirst({
        where: {
          ativo: true,
          codigo: inviteCode,
          OR: [{ expira_em: null }, { expira_em: { gt: new Date() } }],
        },
      })
    : null;

  if (inviteCode && !invitation) {
    throw new AppError("Codigo de convite invalido ou expirado", 400);
  }

  const passwordHash = await argon2.hash(password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  try {
    const user = await prisma.$transaction(async (database) => {
      const storeSignupSource = storeSlug
        ? await findStoreSignupSource(database, storeSlug)
        : null;

      if (storeSignupSource && invitation) {
        throw new AppError(
          "Cadastro por QR da loja nao pode combinar codigo de convite",
          400,
        );
      }

      const createdUser = await database.usuario.create({
        data: {
          enderecos: {
            create: {
              ...addressData(address),
              nome_endereco: "Endereco principal",
              principal: true,
            },
          },
          email,
          kyc: {
            create: {
              nome_completo: name,
              status: "PENDENTE",
              tipo_pessoa: "FISICA",
            },
          },
          nome: name,
          loja_origem_cadastro_id: storeSignupSource?.id ?? null,
          senha_hash: passwordHash,
          status: "ATIVO",
          telefone: phone,
          tipo_conta: "CONSUMIDOR",
        },
      });

      await ensureUserWallets(createdUser.id, database);

      const sponsorUserId = storeSignupSource
        ? storeSignupSource.lojista.usuario_id
        : invitation
          ? invitation.usuario_id
          : (await ensureCompanyRootUser(database)).id;
      const placement = await findMatrixPlacement(database, sponsorUserId);

      await database.indicacao.create({
        data: {
          alocado_sob_usuario_id: placement.parentUserId,
          codigo_convite_id: invitation?.id ?? null,
          indicado_usuario_id: createdUser.id,
          indicador_usuario_id: sponsorUserId,
          nivel_matriz: placement.level,
          origem: storeSignupSource
            ? "cadastro_qr_loja"
            : invitation
              ? "cadastro_mobile"
              : "cadastro_mobile_empresa",
          posicao_matriz: placement.position,
          status: "PENDENTE",
          tipo_indicacao: "CONSUMIDOR",
        },
      });

      if (invitation) {
        await database.codigoConvite.update({
          data: { usos_totais: { increment: 1 } },
          where: { id: invitation.id },
        });
      }

      return createdUser;
    });

    return createSession(audience, toPublicUser(user));
  } catch (error) {
    if (error?.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : String(error.meta?.target ?? "");
      throw new AppError(
        target.includes("cpf")
          ? "Este CPF ja esta cadastrado"
          : target.includes("alocado_sob_usuario_id")
            ? "A posicao da matriz foi ocupada. Tente o cadastro novamente"
          : target.includes("telefone")
            ? "Este telefone ja esta cadastrado"
            : "Este e-mail ja esta cadastrado",
        409,
      );
    }

    throw error;
  }
}

export async function completeCpf({ cpf, userId }) {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const cpfOwner = await prisma.usuario.findUnique({ where: { cpf } });

  if (cpfOwner && cpfOwner.id !== userId) {
    throw new AppError("Este CPF ja esta cadastrado", 409);
  }

  try {
    const updatedUser = await prisma.$transaction(async (database) => {
      const savedUser = await database.usuario.update({
        data: { cpf },
        include: appUserInclude,
        where: { id: userId },
      });
      await database.kycUsuario.upsert({
        create: {
          cpf,
          nome_completo: user.nome,
          status: "PENDENTE",
          tipo_pessoa: "FISICA",
          usuario_id: userId,
        },
        update: { cpf, nome_completo: user.nome },
        where: { usuario_id: userId },
      });
      return savedUser;
    });

    return { user: toPublicUser(updatedUser) };
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Este CPF ja esta cadastrado", 409);
    }

    throw error;
  }
}

export async function refreshSession({ audience, refreshToken }) {
  const payload = verifyToken({
    audience,
    expectedType: "refresh",
    secret: env.jwt.refreshSecret,
    token: refreshToken,
  });
  const userId = parseJwtSubject(payload.sub);

  if (audience === authAudiences.admin) {
    const admin = await prisma.administrador.findUnique({
      where: { id: userId },
    });

    if (!admin || admin.status !== "ATIVO" || admin.excluido_em) {
      throw new AppError("Sessao administrativa nao autorizada", 401);
    }

    return createSession(audience, toPublicAdmin(admin));
  }

  const user = await prisma.usuario.findUnique({
    include: appUserInclude,
    where: { id: userId },
  });

  if (!user || !enabledStatuses.has(user.status)) {
    throw new AppError("Sessao nao autorizada", 401);
  }

  await ensureUserWallets(user.id);

  return createSession(audience, toPublicUser(user));
}

export async function getSessionUser({ audience, userId }) {
  const parsedUserId = Number(userId);

  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new AppError("Sessao nao autorizada", 401);
  }

  if (audience === authAudiences.admin) {
    const admin = await prisma.administrador.findUnique({
      where: { id: parsedUserId },
    });

    if (!admin || admin.status !== "ATIVO" || admin.excluido_em) {
      throw new AppError("Sessao administrativa nao autorizada", 401);
    }

    return toPublicAdmin(admin);
  }

  const user = await prisma.usuario.findUnique({
    include: appUserInclude,
    where: { id: parsedUserId },
  });

  if (!user || !enabledStatuses.has(user.status)) {
    throw new AppError("Sessao nao autorizada", 401);
  }

  await ensureUserWallets(user.id);
  return toPublicUser(user);
}

export function verifyAccessToken({ audience, accessToken }) {
  const payload = verifyToken({
    audience,
    expectedType: "access",
    secret: env.jwt.accessSecret,
    token: accessToken,
  });

  return {
    accountType: payload.accountType,
    email: payload.email,
    id: parseJwtSubject(payload.sub),
    name: payload.name,
    phone: payload.phone,
    role: payload.role,
    roles: Array.isArray(payload.roles) ? payload.roles : [payload.role].filter(Boolean),
    capabilities: payload.capabilities ?? null,
    status: payload.status,
  };
}
