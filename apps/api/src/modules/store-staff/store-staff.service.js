import { createHash, randomBytes } from "crypto";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import {
  createStoreStaffRepository,
  storeStaffRepository,
} from "./store-staff.repository.js";
import { normalizeStorePermissions } from "./store-permissions.js";

const inviteDurationMs = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationToken(value = "") {
  const raw = String(value).trim();
  const prefixed = raw.match(/^BRASIL_CASHBACK:STORE_STAFF:(.+)$/i)?.[1];
  if (prefixed) return prefixed;
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("token") || raw;
  } catch {
    return raw;
  }
}

function serializeStore(store) {
  return {
    bannerUrl: store.banner_url,
    id: store.id,
    logoUrl: store.logo_url,
    name: store.nome,
    slug: store.slug,
    status: store.status,
  };
}

function serializePerson(person) {
  if (!person) return null;
  return {
    email: person.email,
    id: person.id,
    name: person.nome,
    photoUrl: person.foto_url,
    publicId: person.identificador_publico,
  };
}

function serializeInvite(invite) {
  return {
    createdAt: invite.criado_em.toISOString(),
    expiresAt: invite.expira_em.toISOString(),
    id: invite.id,
    invitedUser: serializePerson(invite.convidado),
    role: invite.cargo,
    status: invite.expira_em <= new Date() && invite.status === "PENDENTE"
      ? "EXPIRADO"
      : invite.status,
    store: invite.loja ? serializeStore(invite.loja) : undefined,
  };
}

function serializeMembership(member) {
  const savedPermissions = normalizeStorePermissions(member.permissoes);
  const isOwner = member.cargo === "DONO";
  return {
    id: member.id,
    permissions: {
      createCharges: isOwner || savedPermissions.createCharges === true,
      manageOrders: isOwner || savedPermissions.manageOrders === true,
      storeChats: isOwner || savedPermissions.storeChats === true,
    },
    role: member.cargo,
    status: member.status,
    store: member.loja ? serializeStore(member.loja) : undefined,
    user: serializePerson(member.usuario),
  };
}

async function requireOwner(repository, userId, storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const store = await repository.findOwnerStore(parsedStoreId, userId);
  if (!store) throw new AppError("Somente o dono pode gerenciar a equipe desta loja", 403);
  return store;
}

export async function getStoreTeam(userId, storeId, repository = storeStaffRepository) {
  const store = await requireOwner(repository, userId, storeId);
  const [members, invitations] = await Promise.all([
    repository.listMembersForStore(store.id),
    repository.listInvitesForStore(store.id),
  ]);
  return {
    invitations: invitations.map(serializeInvite).filter((invite) => invite.status === "PENDENTE"),
    members: members.map(serializeMembership),
    store: serializeStore(store),
  };
}

export async function createStoreStaffInvite(userId, storeId, data, repository = storeStaffRepository) {
  const store = await requireOwner(repository, userId, storeId);
  const identifier = String(data.publicId ?? "").trim().replace(/^@/, "");
  const invitedUser = identifier
    ? await repository.findUserByPublicIdentifier(identifier)
    : null;

  if (identifier && !invitedUser) throw new AppError("Nenhuma conta encontrada com este ID", 404);
  if (invitedUser?.id === userId) throw new AppError("O dono ja possui acesso total a loja", 409);

  if (invitedUser) {
    const member = await repository.findMember({
      where: { loja_id: store.id, status: "ATIVO", usuario_id: invitedUser.id },
    });
    if (member) throw new AppError("Esta pessoa ja faz parte da equipe", 409);
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + inviteDurationMs);
  const invite = await repository.transaction(async (database) => {
    const transactional = createStoreStaffRepository(database);
    if (invitedUser) {
      await transactional.deletePendingInvites({
        data: { status: "REVOGADO" },
        where: {
          convidado_usuario_id: invitedUser.id,
          loja_id: store.id,
          status: "PENDENTE",
        },
      });
    }
    const created = await transactional.createInvite({
      data: {
        cargo: "ATENDENTE",
        convidado_usuario_id: invitedUser?.id ?? null,
        criado_por_usuario_id: userId,
        expira_em: expiresAt,
        loja_id: store.id,
        token_hash: hashToken(rawToken),
      },
      include: {
        convidado: {
          select: {
            email: true,
            foto_url: true,
            id: true,
            identificador_publico: true,
            nome: true,
          },
        },
      },
    });
    if (invitedUser) {
      await transactional.sendPersonalInvitationMessage({
        recipientId: invitedUser.id,
        senderId: userId,
        storeName: store.nome,
      });
    }
    return created;
  });

  return {
    invitation: serializeInvite(invite),
    qrValue: `BRASIL_CASHBACK:STORE_STAFF:${rawToken}`,
    shareUrl: `detudoja://funcionario/aceitar?token=${encodeURIComponent(rawToken)}`,
    store: serializeStore(store),
  };
}

export async function getMyStoreWorkplaces(userId, repository = storeStaffRepository) {
  const [memberships, invitations] = await Promise.all([
    repository.listWorkplaces(userId),
    repository.listReceivedInvites(userId),
  ]);
  return {
    invitations: invitations.map(serializeInvite).filter((invite) => invite.status === "PENDENTE"),
    workplaces: memberships.map(serializeMembership),
  };
}

async function resolvePendingInvite(repository, userId, { invitationId, token }) {
  const normalizedToken = invitationToken(token);
  const invite = await repository.findInvite({
    include: { loja: true },
    where: {
      status: "PENDENTE",
      ...(invitationId
        ? { id: parsePositiveId(invitationId, "Convite invalido"), convidado_usuario_id: userId }
        : { token_hash: hashToken(normalizedToken) }),
    },
  });
  if (!invite) throw new AppError("Convite invalido, revogado ou ja utilizado", 404);
  if (invite.convidado_usuario_id && invite.convidado_usuario_id !== userId) {
    throw new AppError("Este convite pertence a outra conta", 403);
  }
  if (invite.expira_em <= new Date()) {
    await repository.updateInvite({ data: { status: "EXPIRADO" }, where: { id: invite.id } });
    throw new AppError("Este convite expirou. Solicite outro ao dono da loja", 410);
  }
  return invite;
}

export async function acceptStoreStaffInvite(userId, data, repository = storeStaffRepository) {
  const invite = await resolvePendingInvite(repository, userId, data);
  await repository.transaction(async (database) => {
    const transactional = createStoreStaffRepository(database);
    const claim = await transactional.updateInvites({
      data: { aceito_em: new Date(), convidado_usuario_id: userId, status: "ACEITO" },
      where: {
        id: invite.id,
        status: "PENDENTE",
        OR: [{ convidado_usuario_id: null }, { convidado_usuario_id: userId }],
      },
    });
    if (claim.count !== 1) throw new AppError("Este convite ja foi utilizado", 409);
    await transactional.upsertMember({
      create: {
        cargo: invite.cargo,
        loja_id: invite.loja_id,
        permissoes: { storeChats: true },
        status: "ATIVO",
        usuario_id: userId,
      },
      update: {
        cargo: invite.cargo,
        permissoes: { storeChats: true },
        status: "ATIVO",
      },
      where: { loja_id_usuario_id: { loja_id: invite.loja_id, usuario_id: userId } },
    });
  });
  return { accepted: true, role: invite.cargo, store: serializeStore(invite.loja) };
}

export async function declineStoreStaffInvite(userId, invitationId, repository = storeStaffRepository) {
  const invite = await resolvePendingInvite(repository, userId, { invitationId });
  await repository.updateInvite({ data: { status: "RECUSADO" }, where: { id: invite.id } });
  return { declined: true };
}

export async function revokeStoreMember(userId, storeId, memberId, repository = storeStaffRepository) {
  const store = await requireOwner(repository, userId, storeId);
  const parsedMemberId = parsePositiveId(memberId, "Funcionario invalido");
  const member = await repository.findMember({
    where: { id: parsedMemberId, loja_id: store.id, status: "ATIVO" },
  });
  if (!member) throw new AppError("Funcionario nao encontrado nesta loja", 404);
  if (member.cargo === "DONO" || member.usuario_id === userId) {
    throw new AppError("O acesso do dono nao pode ser removido", 409);
  }
  await repository.updateMember({
    data: { status: "INATIVO" },
    where: { id: member.id, loja_id: store.id },
  });
  return { removed: true };
}

export async function updateStoreMemberPermissions(userId, storeId, memberId, data, repository = storeStaffRepository) {
  const store = await requireOwner(repository, userId, storeId);
  const parsedMemberId = parsePositiveId(memberId, "Funcionario invalido");
  const member = await repository.findMember({
    where: { id: parsedMemberId, loja_id: store.id, status: "ATIVO" },
  });
  if (!member) throw new AppError("Funcionario nao encontrado nesta loja", 404);
  if (member.cargo === "DONO" || member.usuario_id === userId) {
    throw new AppError("As permissoes do dono nao podem ser limitadas", 409);
  }

  await repository.updateMember({
    data: { permissoes: data.permissions },
    where: { id: member.id, loja_id: store.id },
  });

  return {
    member: serializeMembership({ ...member, permissoes: data.permissions }),
    updated: true,
  };
}
