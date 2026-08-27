import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { getPagination } from "../../utils/pagination.js";
import { serializeAdminUser } from "./admin.serializer.js";
import { creditUserWallet } from "../wallet/wallet.service.js";
import { adminUsersRepository } from "./admin-users.repository.js";

const validStatuses = new Set(["ATIVO", "INATIVO", "BLOQUEADO", "PENDENTE"]);
const validKycStatuses = new Set([
  "PENDENTE",
  "EM_ANALISE",
  "APROVADO",
  "REPROVADO",
  "BLOQUEADO",
]);

function buildUserWhere(query) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const kycStatus = String(query.kycStatus ?? "").toUpperCase();

  return {
    excluido_em: null,
    tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
    ...(validStatuses.has(status) ? { status } : {}),
    ...(validKycStatuses.has(kycStatus)
      ? { kyc: { is: { status: kycStatus } } }
      : {}),
    ...(search
      ? {
          OR: [
            { nome: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { telefone: { contains: search.replace(/\D/g, "") } },
            { cpf: { contains: search.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };
}

export async function listAdminUsers(query) {
  const { page, perPage } = getPagination(query);
  const where = buildUserWhere(query);
  const [total, users] = await Promise.all([
    adminUsersRepository.count(where),
    adminUsersRepository.list({ page, perPage, where }),
  ]);

  return {
    pagination: {
      page,
      pages: Math.max(Math.ceil(total / perPage), 1),
      perPage,
      total,
    },
    users: users.map(serializeAdminUser),
  };
}

export async function getAdminUser(userId) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const user = await adminUsersRepository.findParticipant(parsedUserId);

  if (!user) {
    throw new AppError("Participante nao encontrado", 404);
  }

  return { user: serializeAdminUser(user, { includeSensitive: true }) };
}

export async function updateAdminUserStatus(userId, status) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const exists = await adminUsersRepository.findParticipantId(parsedUserId);

  if (!exists) {
    throw new AppError("Participante nao encontrado", 404);
  }

  await adminUsersRepository.update(parsedUserId, { status });

  return getAdminUser(parsedUserId);
}

export async function updateAdminUser(userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const exists = await adminUsersRepository.findParticipantId(parsedUserId);

  if (!exists) {
    throw new AppError("Participante nao encontrado", 404);
  }

  await adminUsersRepository.update(parsedUserId, {
    ...(data.cpf !== undefined ? { cpf: data.cpf.replace(/\D/g, "") || null } : {}),
    ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
    ...(data.name !== undefined ? { nome: data.name.trim() } : {}),
    ...(data.phone !== undefined ? { telefone: data.phone.replace(/\D/g, "") || null } : {}),
  });

  return getAdminUser(parsedUserId);
}

export async function creditAdminUserWallet(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const exists = await adminUsersRepository.findParticipantId(parsedUserId);

  if (!exists) {
    throw new AppError("Participante nao encontrado", 404);
  }

  await adminUsersRepository.transaction(async (database) => {
    await creditUserWallet({
      database,
      description: data.description,
      origin: "AJUSTE_ADMIN",
      originId: adminId,
      userId: parsedUserId,
      valueCents: data.valueCents,
      walletCode: data.walletCode,
    });
  });

  return getAdminUser(parsedUserId);
}
