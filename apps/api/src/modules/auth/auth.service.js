import { createHash, randomBytes, randomUUID } from "crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { addressData } from "../../utils/location.js";
import { AppError } from "../../utils/errors.js";
import { authRepository } from "./auth.repository.js";
import {
  findStoreSignupSource,
  findStoreSignupSourceByCode,
  isStoreRegistrationCode,
} from "./store-signup.service.js";
import { ensureUserWallets } from "../wallet/wallet.service.js";
import { verifySocialIdentity } from "./social-auth.service.js";
import { sendPasswordResetEmail } from "./password-reset-mail.service.js";

export const authAudiences = {
  admin: "detudoja-admin",
  app: "detudoja-app",
};

const enabledStatuses = new Set(["ATIVO", "PENDENTE"]);
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
    publicId: user.identificador_publico,
    role: roles[0],
    roles,
    status: user.status,
  };
}

function signToken({ audience, expiresIn, jti, secret, tokenType, user }) {
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
      ...(jti ? { jti } : {}),
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

function refreshTokenExpiresAt(refreshToken) {
  const decoded = jwt.decode(refreshToken);

  if (!decoded || typeof decoded === "string" || !decoded.exp) {
    throw new AppError("Nao foi possivel criar a sessao", 500);
  }

  return new Date(Number(decoded.exp) * 1000);
}

async function createSession(audience, user) {
  const jti = randomUUID();
  const accessToken = signToken({
    audience,
    expiresIn: env.jwt.accessExpiresIn,
    secret: env.jwt.accessSecret,
    tokenType: "access",
    user,
  });
  const refreshToken = signToken({
    audience,
    expiresIn: env.jwt.refreshExpiresIn,
    jti,
    secret: env.jwt.refreshSecret,
    tokenType: "refresh",
    user,
  });

  await authRepository.createSession({
    administrador_id: audience === authAudiences.admin ? user.id : null,
    audiencia: audience,
    expira_em: refreshTokenExpiresAt(refreshToken),
    jti,
    usuario_id: audience === authAudiences.app ? user.id : null,
  });

  return {
    accessToken,
    expiresIn: env.jwt.accessExpiresIn,
    refreshToken,
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
  return authRepository.findAppUserByLogin(loginValue);
}

async function findAdmin(loginValue) {
  return authRepository.findAdminByLogin(loginValue);
}

async function verifyPassword(passwordHash, password) {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

async function createGeneratedPasswordHash() {
  return argon2.hash(randomUUID(), {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
}

async function createPasswordHash(password) {
  return argon2.hash(password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
}

function hashPasswordResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function buildPasswordResetUrl(token) {
  const url = new URL(env.passwordReset.url);
  url.searchParams.set("token", token);
  return url.toString();
}

async function ensureCompanyRootUser(repository) {
  const email = env.companyRoot.email.trim().toLowerCase();
  const existingUser = await repository.findCompanyRootUserByEmail(email);

  if (existingUser) {
    return existingUser;
  }

  const passwordHash = await createGeneratedPasswordHash();

  return repository.createCompanyRootUser({
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
  });
}

async function findMatrixPlacement(repository, sponsorUserId) {
  const sponsorPlacement = await repository.findMatrixPlacementByUserId(sponsorUserId);
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

    const children = await repository.findMatrixChildren(node.userId);
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

    const updatedAdmin = await authRepository.updateAdminLastLogin(admin.id);

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

  const updatedUser = await authRepository.updateUserLastLogin(user.id);

  return createSession(audience, toPublicUser(updatedUser));
}

export async function loginWithSocial({ audience, idToken, name, provider }) {
  if (audience !== authAudiences.app) {
    throw new AppError("Login social nao permitido para esta aplicacao", 403);
  }

  const identity = await verifySocialIdentity({ idToken, provider });
  const existingIdentity = await authRepository.findSocialIdentity(
    identity.provider,
    identity.providerUserId,
  );

  if (existingIdentity) {
    if (!enabledStatuses.has(existingIdentity.usuario.status)) {
      throw new AppError("Esta conta nao esta disponivel para acesso", 403);
    }

    await ensureUserWallets(existingIdentity.usuario_id);
    const user = await authRepository.updateUserLastLogin(existingIdentity.usuario_id);
    return createSession(audience, toPublicUser(user));
  }

  if (!identity.email) {
    throw new AppError(
      "A Apple nao enviou seu e-mail. Entre novamente e permita compartilhar o e-mail.",
      422,
    );
  }

  const passwordHash = await createGeneratedPasswordHash();

  try {
    const user = await authRepository.transaction(async (repository, database) => {
      const existingUser = await repository.findUserByEmail(identity.email);

      if (existingUser) {
        await repository.createSocialIdentity({
          email_provedor: identity.email,
          provedor: identity.provider,
          provedor_usuario_id: identity.providerUserId,
          usuario_id: existingUser.id,
        });
        await ensureUserWallets(existingUser.id, database);
        return repository.updateUserLastLogin(existingUser.id);
      }

      const userName = String(name ?? identity.name).trim().slice(0, 160) || identity.name;
      const createdUser = await repository.createSocialUser({
        email: identity.email,
        email_verificado: true,
        identidades_sociais: {
          create: {
            email_provedor: identity.email,
            provedor: identity.provider,
            provedor_usuario_id: identity.providerUserId,
          },
        },
        kyc: {
          create: {
            nome_completo: userName,
            status: "PENDENTE",
            tipo_pessoa: "FISICA",
          },
        },
        nome: userName,
        senha_hash: passwordHash,
        status: "ATIVO",
        tipo_conta: "CONSUMIDOR",
        ultimo_login_em: new Date(),
      });

      await ensureUserWallets(createdUser.id, database);

      const sponsorUserId = (await ensureCompanyRootUser(repository)).id;
      const placement = await findMatrixPlacement(repository, sponsorUserId);
      await repository.createIndication({
        alocado_sob_usuario_id: placement.parentUserId,
        indicado_usuario_id: createdUser.id,
        indicador_usuario_id: sponsorUserId,
        nivel_matriz: placement.level,
        origem: "cadastro_social_empresa",
        posicao_matriz: placement.position,
        status: "PENDENTE",
        tipo_indicacao: "CONSUMIDOR",
      });

      return repository.findUserWithProfileOrThrow(createdUser.id);
    });

    return createSession(audience, toPublicUser(user));
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Esta conta social ja esta vinculada a outro usuario", 409);
    }

    throw error;
  }
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

  const existingUser = await authRepository.findUserConflict(email, phone);

  if (existingUser) {
    throw duplicateRegistrationError(existingUser, { email, phone });
  }

  const storeCode = isStoreRegistrationCode(inviteCode) ? inviteCode : null;
  const effectiveInviteCode = storeCode ? null : inviteCode;
  const invitation = effectiveInviteCode
    ? await authRepository.findInvitation(effectiveInviteCode)
    : null;

  if (effectiveInviteCode && !invitation) {
    throw new AppError("Codigo de convite invalido ou expirado", 400);
  }

  const passwordHash = await argon2.hash(password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  try {
    const user = await authRepository.transaction(async (repository, database) => {
      const storeSignupSource = storeSlug
        ? await findStoreSignupSource(database, storeSlug)
        : storeCode
          ? await findStoreSignupSourceByCode(database, storeCode)
          : null;

      if (storeSignupSource && invitation) {
        throw new AppError(
          "Cadastro por QR da loja nao pode combinar codigo de convite",
          400,
        );
      }

      const createdUser = await repository.createRegisteredUser({
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
      });

      await ensureUserWallets(createdUser.id, database);

      const sponsorUserId = storeSignupSource
        ? storeSignupSource.lojista.usuario_id
        : invitation
          ? invitation.usuario_id
          : (await ensureCompanyRootUser(repository)).id;
      const placement = await findMatrixPlacement(repository, sponsorUserId);

      await repository.createIndication({
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
      });

      if (invitation) {
        await repository.incrementInvitationUses(invitation.id);
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
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const cpfOwner = await authRepository.findUserByCpf(cpf);

  if (cpfOwner && cpfOwner.id !== userId) {
    throw new AppError("Este CPF ja esta cadastrado", 409);
  }

  try {
    const updatedUser = await authRepository.transaction(async (repository) => {
      const savedUser = await repository.updateUserWithProfile(userId, { cpf });
      await repository.upsertUserKyc(
        userId,
        {
          cpf,
          nome_completo: user.nome,
          status: "PENDENTE",
          tipo_pessoa: "FISICA",
          usuario_id: userId,
        },
        { cpf, nome_completo: user.nome },
      );
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

export async function requestPasswordReset({ email }) {
  const user = await authRepository.findUserByEmail(email);

  // A resposta e identica para e-mails cadastrados ou nao, evitando enumeracao.
  if (!user || !enabledStatuses.has(user.status) || user.excluido_em) {
    return { accepted: true };
  }

  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + env.passwordReset.expiresMinutes * 60 * 1000,
  );

  await authRepository.transaction(async (repository) => {
    await repository.invalidatePasswordResetTokens(user.id, createdAt);
    await repository.createPasswordResetToken({
      expira_em: expiresAt,
      token_hash: hashPasswordResetToken(token),
      usuario_id: user.id,
    });
  });

  await sendPasswordResetEmail({
    email: user.email,
    name: user.nome,
    resetUrl: buildPasswordResetUrl(token),
  });

  return { accepted: true };
}

export async function resetPassword({ password, token }) {
  const tokenHash = hashPasswordResetToken(token);
  const usedAt = new Date();

  await authRepository.transaction(async (repository) => {
    const resetToken = await repository.findActivePasswordResetToken(tokenHash, usedAt);

    if (!resetToken || !enabledStatuses.has(resetToken.usuario.status)) {
      throw new AppError("Este link e invalido ou expirou. Solicite outro.", 400);
    }

    const consumed = await repository.consumePasswordResetToken(tokenHash, usedAt);

    if (consumed.count !== 1) {
      throw new AppError("Este link ja foi utilizado. Solicite outro.", 400);
    }

    const passwordHash = await createPasswordHash(password);
    await repository.updateUserPassword(resetToken.usuario_id, passwordHash, usedAt);
    await repository.revokeUserSessions(resetToken.usuario_id, usedAt);
  });

  return { reset: true };
}

export async function refreshSession({ audience, refreshToken }) {
  const payload = verifyToken({
    audience,
    expectedType: "refresh",
    secret: env.jwt.refreshSecret,
    token: refreshToken,
  });
  const userId = parseJwtSubject(payload.sub);
  const jti = String(payload.jti ?? "").trim();

  if (!jti) {
    throw new AppError("Sessao invalida", 401);
  }

  const rotated = await authRepository.rotateSession({
    audience,
    ...(audience === authAudiences.admin
      ? { adminId: userId }
      : { userId }),
    jti,
  });

  if (rotated.count !== 1) {
    throw new AppError("Esta sessao foi encerrada ou ja foi renovada", 401);
  }

  if (audience === authAudiences.admin) {
    const admin = await authRepository.findAdminById(userId);

    if (!admin || admin.status !== "ATIVO" || admin.excluido_em) {
      throw new AppError("Sessao administrativa nao autorizada", 401);
    }

    return createSession(audience, toPublicAdmin(admin));
  }

  const user = await authRepository.findAppUserById(userId);

  if (!user || !enabledStatuses.has(user.status)) {
    throw new AppError("Sessao nao autorizada", 401);
  }

  await ensureUserWallets(user.id);

  return createSession(audience, toPublicUser(user));
}

export async function logoutSession({ audience, refreshToken, userId }) {
  const payload = verifyToken({
    audience,
    expectedType: "refresh",
    secret: env.jwt.refreshSecret,
    token: refreshToken,
  });
  const tokenUserId = parseJwtSubject(payload.sub);
  const jti = String(payload.jti ?? "").trim();

  if (!jti || tokenUserId !== Number(userId)) {
    throw new AppError("Sessao invalida", 401);
  }

  await authRepository.revokeSession({
    audience,
    ...(audience === authAudiences.admin
      ? { adminId: tokenUserId }
      : { userId: tokenUserId }),
    jti,
  });
}

export async function getSessionUser({ audience, userId }) {
  const parsedUserId = Number(userId);

  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new AppError("Sessao nao autorizada", 401);
  }

  if (audience === authAudiences.admin) {
    const admin = await authRepository.findAdminById(parsedUserId);

    if (!admin || admin.status !== "ATIVO" || admin.excluido_em) {
      throw new AppError("Sessao administrativa nao autorizada", 401);
    }

    return toPublicAdmin(admin);
  }

  const user = await authRepository.findAppUserById(parsedUserId);

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
