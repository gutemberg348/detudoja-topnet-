import argon2 from "argon2";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";

function serializeAdministrator(admin) {
  return {
    createdAt: admin.criado_em.toISOString(),
    email: admin.email,
    id: admin.id,
    lastLoginAt: admin.ultimo_login_em?.toISOString() ?? null,
    name: admin.nome,
    phone: admin.telefone,
    role: admin.papel,
    status: admin.status,
  };
}

function duplicateAdminError(error) {
  if (error?.code !== "P2002") return null;
  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(",")
    : String(error.meta?.target ?? "");
  return new AppError(
    target.includes("telefone")
      ? "Este telefone ja pertence a outro administrador"
      : "Este e-mail ja pertence a outro administrador",
    409,
  );
}

export async function listAdministrators() {
  const administrators = await prisma.administrador.findMany({
    orderBy: { criado_em: "desc" },
    where: { excluido_em: null },
  });
  return { administrators: administrators.map(serializeAdministrator) };
}

export async function createAdministrator(actorAdminId, data) {
  const passwordHash = await argon2.hash(data.password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });

  try {
    const administrator = await prisma.$transaction(async (database) => {
      const created = await database.administrador.create({
        data: {
          email: data.email.trim().toLowerCase(),
          nome: data.name.trim(),
          papel: data.role,
          senha_hash: passwordHash,
          status: "ATIVO",
          telefone: data.phone?.replace(/\D/g, "") || null,
        },
      });
      await database.auditoriaAdministrativa.create({
        data: {
          acao: "ADMINISTRADOR_CRIADO",
          administrador_id: actorAdminId,
          dados_json: { administradorId: created.id, email: created.email, papel: created.papel },
        },
      });
      return created;
    });
    return { administrator: serializeAdministrator(administrator) };
  } catch (error) {
    throw duplicateAdminError(error) ?? error;
  }
}

export async function updateAdministratorStatus(actorAdminId, administratorId, status) {
  const parsedId = parsePositiveId(administratorId, "Administrador invalido");
  if (parsedId === Number(actorAdminId) && status !== "ATIVO") {
    throw new AppError("Voce nao pode bloquear ou desativar a propria conta", 409);
  }

  const administrator = await prisma.$transaction(async (database) => {
    const current = await database.administrador.findFirst({
      where: { excluido_em: null, id: parsedId },
    });
    if (!current) throw new AppError("Administrador nao encontrado", 404);

    const updated = await database.administrador.update({ data: { status }, where: { id: parsedId } });
    if (status !== "ATIVO") {
      await database.sessaoAutenticacao.updateMany({
        data: { revogada_em: new Date() },
        where: { administrador_id: parsedId, revogada_em: null },
      });
    }
    await database.auditoriaAdministrativa.create({
      data: {
        acao: "ADMINISTRADOR_STATUS_ATUALIZADO",
        administrador_id: actorAdminId,
        dados_json: {
          administradorId: parsedId,
          statusAnterior: current.status,
          statusNovo: status,
        },
      },
    });
    return updated;
  });
  return { administrator: serializeAdministrator(administrator) };
}
