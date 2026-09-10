import { randomBytes } from "crypto";
import { prisma } from "../../config/prisma.js";

const appUserInclude = {
  kyc: true,
  lojista: true,
  vendedor: true,
};

function withPublicIdentifier(data) {
  if (data.identificador_publico) return data;

  const name = String(data.nome ?? "usuario")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48) || "usuario";

  return {
    ...data,
    identificador_publico: `${name}.${randomBytes(4).toString("hex")}`,
  };
}

export function createAuthRepository(database = prisma) {
  return {
    createCompanyRootUser(data) {
      return database.usuario.create({ data: withPublicIdentifier(data) });
    },

    createIndication(data) {
      return database.indicacao.create({ data });
    },

    createRegisteredUser(data) {
      return database.usuario.create({ data: withPublicIdentifier(data) });
    },

    createSession(data) {
      return database.sessaoAutenticacao.create({ data });
    },

    createPasswordResetToken(data) {
      return database.tokenRecuperacaoSenha.create({ data });
    },

    createSocialIdentity(data) {
      return database.identidadeSocialUsuario.create({ data });
    },

    createSocialUser(data) {
      return database.usuario.create({ data: withPublicIdentifier(data) });
    },

    findAdminById(id) {
      return database.administrador.findUnique({ where: { id } });
    },

    findAdminByLogin(loginValue) {
      return loginValue.includes("@")
        ? database.administrador.findUnique({ where: { email: loginValue } })
        : database.administrador.findUnique({ where: { telefone: loginValue } });
    },

    findAppUserById(id) {
      return database.usuario.findUnique({
        include: appUserInclude,
        where: { id },
      });
    },

    findAppUserByLogin(loginValue) {
      return loginValue.includes("@")
        ? database.usuario.findUnique({
            include: appUserInclude,
            where: { email: loginValue },
          })
        : database.usuario.findUnique({
            include: appUserInclude,
            where: { telefone: loginValue },
          });
    },

    findCompanyRootUserByEmail(email) {
      return database.usuario.findUnique({ where: { email } });
    },

    findInvitation(code, now = new Date()) {
      return database.codigoConvite.findFirst({
        where: {
          ativo: true,
          codigo: code,
          OR: [{ expira_em: null }, { expira_em: { gt: now } }],
        },
      });
    },

    findMatrixChildren(userId) {
      return database.indicacao.findMany({
        orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
        select: {
          indicado_usuario_id: true,
          nivel_matriz: true,
          posicao_matriz: true,
        },
        where: {
          status: { in: ["ATIVA", "CONVERTIDA", "PENDENTE"] },
          OR: [
            { alocado_sob_usuario_id: userId },
            {
              alocado_sob_usuario_id: null,
              indicador_usuario_id: userId,
            },
          ],
        },
      });
    },

    findMatrixPlacementByUserId(userId) {
      return database.indicacao.findUnique({
        select: { nivel_matriz: true },
        where: { indicado_usuario_id: userId },
      });
    },

    findSocialIdentity(provider, providerUserId) {
      return database.identidadeSocialUsuario.findUnique({
        include: { usuario: { include: appUserInclude } },
        where: {
          provedor_provedor_usuario_id: {
            provedor: provider,
            provedor_usuario_id: providerUserId,
          },
        },
      });
    },

    findUserByCpf(cpf) {
      return database.usuario.findUnique({ where: { cpf } });
    },

    findUserByEmail(email) {
      return database.usuario.findUnique({ where: { email } });
    },

    findUserById(id) {
      return database.usuario.findUnique({ where: { id } });
    },

    findActivePasswordResetToken(tokenHash, now = new Date()) {
      return database.tokenRecuperacaoSenha.findFirst({
        include: { usuario: true },
        where: {
          expira_em: { gt: now },
          token_hash: tokenHash,
          usado_em: null,
        },
      });
    },

    findUserConflict(email, phone) {
      return database.usuario.findFirst({
        where: { OR: [{ email }, { telefone: phone }] },
      });
    },

    findUserWithProfileOrThrow(id) {
      return database.usuario.findUniqueOrThrow({
        include: appUserInclude,
        where: { id },
      });
    },

    incrementInvitationUses(id) {
      return database.codigoConvite.update({
        data: { usos_totais: { increment: 1 } },
        where: { id },
      });
    },

    revokeSession({ audience, adminId, jti, userId }) {
      return database.sessaoAutenticacao.updateMany({
        data: { revogada_em: new Date() },
        where: {
          audiencia: audience,
          jti,
          revogada_em: null,
          ...(adminId ? { administrador_id: adminId } : { usuario_id: userId }),
        },
      });
    },

    revokeUserSessions(userId, date = new Date()) {
      return database.sessaoAutenticacao.updateMany({
        data: { revogada_em: date },
        where: {
          audiencia: "detudoja-app",
          revogada_em: null,
          usuario_id: userId,
        },
      });
    },

    rotateSession({ audience, adminId, jti, userId }, now = new Date()) {
      return database.sessaoAutenticacao.updateMany({
        data: { revogada_em: now, rotacionada_em: now },
        where: {
          audiencia: audience,
          expira_em: { gt: now },
          jti,
          revogada_em: null,
          ...(adminId ? { administrador_id: adminId } : { usuario_id: userId }),
        },
      });
    },

    consumePasswordResetToken(tokenHash, now = new Date()) {
      return database.tokenRecuperacaoSenha.updateMany({
        data: { usado_em: now },
        where: {
          expira_em: { gt: now },
          token_hash: tokenHash,
          usado_em: null,
        },
      });
    },

    invalidatePasswordResetTokens(userId, date = new Date()) {
      return database.tokenRecuperacaoSenha.updateMany({
        data: { usado_em: date },
        where: { usuario_id: userId, usado_em: null },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) =>
        work(createAuthRepository(transaction), transaction),
      );
    },

    updateAdminLastLogin(id, date = new Date()) {
      return database.administrador.update({
        data: { ultimo_login_em: date },
        where: { id },
      });
    },

    updateUserLastLogin(id, date = new Date()) {
      return database.usuario.update({
        data: { ultimo_login_em: date },
        include: appUserInclude,
        where: { id },
      });
    },

    updateUserPassword(id, passwordHash, date = new Date()) {
      return database.usuario.update({
        data: {
          senha_hash: passwordHash,
          atualizado_em: date,
        },
        where: { id },
      });
    },

    updateUserWithProfile(id, data) {
      return database.usuario.update({
        data,
        include: appUserInclude,
        where: { id },
      });
    },

    upsertUserKyc(userId, create, update) {
      return database.kycUsuario.upsert({
        create,
        update,
        where: { usuario_id: userId },
      });
    },
  };
}

export const authRepository = createAuthRepository();
