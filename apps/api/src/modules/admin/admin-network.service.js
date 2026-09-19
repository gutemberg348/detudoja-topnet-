import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import {
  adminNetworkRepository,
  createAdminNetworkRepository,
} from "./admin-network.repository.js";

function activeVerifiedDirectCount(user) {
  return user.indicacoes_feitas.filter(
    (indication) =>
      indication.indicado.status === "ATIVO" &&
      indication.indicado.kyc?.status === "APROVADO",
  ).length;
}

function sideLabel(position) {
  if (position === 1) {
    return "ESQUERDA";
  }

  if (position === 2) {
    return "DIREITA";
  }

  return null;
}

function serializeUser(user, context = {}) {
  const active = user.status === "ATIVO";
  const verified = user.kyc?.status === "APROVADO";
  const activeVerifiedDirects = activeVerifiedDirectCount(user);
  const parentConnectionType =
    context.level === 0
      ? "RAIZ"
      : context.directSponsorId === context.parentId
        ? "DIRETA"
        : "REDE";

  return {
    accountType: user.tipo_conta,
    active,
    activeVerifiedDirects,
    branch: context.branch ?? null,
    createdAt: user.criado_em.toISOString(),
    directSponsorEmail: context.directSponsorEmail ?? null,
    directSponsorId: context.directSponsorId ?? null,
    directSponsorName: context.directSponsorName ?? null,
    email: user.email,
    networkEarningsBlocked: Boolean(user.ganhos_rede_bloqueados),
    networkEarningsBlockedAt: user.ganhos_rede_bloqueados_em?.toISOString() ?? null,
    networkEarningsBlockReason: user.motivo_bloqueio_ganhos_rede ?? null,
    id: user.id,
    indicationStatus: context.indicationStatus ?? null,
    isDirectToRoot: context.directSponsorId === context.rootUserId,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    kycLevel: user.nivel_kyc,
    lastLoginAt: user.ultimo_login_em?.toISOString() ?? null,
    level: context.level ?? 0,
    name: user.nome,
    parentEmail: context.parentEmail ?? null,
    parentConnectionType,
    parentId: context.parentId ?? null,
    parentName: context.parentName ?? null,
    parentSide: context.parentSide ?? sideLabel(context.position),
    phone: user.telefone,
    position: context.position ?? null,
    publicIdentifier: user.identificador_publico,
    qualified: active && verified && activeVerifiedDirects >= 2 && !user.ganhos_rede_bloqueados,
    reward: {
      direct: parentConnectionType === "DIRETA",
      network: parentConnectionType !== "RAIZ",
    },
    status: user.status,
    city: user.cidade_busca,
    state: user.estado_busca,
    verified,
  };
}

function parseMaxDepth(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function parseOptionalPositiveIntId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findCompanyRoot() {
  return adminNetworkRepository.findCompanyRoot(
    env.companyRoot.email.trim().toLowerCase(),
  );
}

async function findMatrixChildren(parentIds) {
  return adminNetworkRepository.findMatrixChildren(parentIds);
}

async function buildNetworkTree(rootUser, maxDepth) {
  const people = [];
  const visited = new Set([rootUser.id]);
  let frontier = [
    {
      branch: null,
      level: 0,
      userId: rootUser.id,
    },
  ];

  for (let level = 1; level <= maxDepth && frontier.length > 0; level += 1) {
    const parentIds = frontier.map((node) => node.userId);
    const parentById = new Map(frontier.map((node) => [node.userId, node]));
    const indications = await findMatrixChildren(parentIds);
    const nextFrontier = [];

    for (const indication of indications) {
      if (visited.has(indication.indicado_usuario_id)) {
        continue;
      }

      const parent = parentById.get(indication.alocado_sob_usuario_id);

      if (!parent) {
        continue;
      }

      visited.add(indication.indicado_usuario_id);

      const position = indication.posicao_matriz ?? 1;
      const branch = parent.branch ?? sideLabel(position);

      people.push(
        serializeUser(indication.indicado, {
          branch,
          directSponsorEmail: indication.indicador.email,
          directSponsorId: indication.indicador_usuario_id,
          directSponsorName: indication.indicador.nome,
          indicationStatus: indication.status,
          level,
          parentEmail: indication.alocado_sob?.email ?? null,
          parentId: indication.alocado_sob_usuario_id,
          parentName: indication.alocado_sob?.nome ?? null,
          parentSide: sideLabel(position),
          position,
          rootUserId: rootUser.id,
        }),
      );

      nextFrontier.push({
        branch,
        level,
        userId: indication.indicado_usuario_id,
      });
    }

    frontier = nextFrontier;
  }

  return people;
}

async function findOrphanUsers(rootUserId) {
  const users = await adminNetworkRepository.findOrphanUsers(rootUserId);

  return users.map((user) => ({
    accountType: user.tipo_conta,
    createdAt: user.criado_em.toISOString(),
    email: user.email,
    id: user.id,
    name: user.nome,
    status: user.status,
  }));
}

async function findUnallocatedIndications() {
  const indications = await adminNetworkRepository.findUnallocatedIndications();

  return indications.map((indication) => ({
    createdAt: indication.criado_em.toISOString(),
    directSponsorEmail: indication.indicador.email,
    directSponsorId: indication.indicador_usuario_id,
    directSponsorName: indication.indicador.nome,
    id: indication.id,
    indicatedEmail: indication.indicado.email,
    indicatedId: indication.indicado_usuario_id,
    indicatedName: indication.indicado.nome,
    status: indication.status,
  }));
}

export async function getAdminNetworkOverview(query = {}) {
  const maxDepth = parseMaxDepth(query.maxDepth);
  const rootUserId = parseOptionalPositiveIntId(query.rootUserId);
  const rootUser = rootUserId
    ? await adminNetworkRepository.findRootById(rootUserId)
    : await findCompanyRoot();

  if (!rootUser) {
    const [orphanUsers, unallocatedIndications] = await Promise.all([
      findOrphanUsers(0),
      findUnallocatedIndications(),
    ]);

    return {
      diagnostics: {
        orphanUsers,
        unallocatedIndications,
      },
      levels: [],
      people: [],
      root: null,
      summary: {
        active: 0,
        directToRoot: 0,
        earningsBlocked: 0,
        maxDepth,
        orphans: orphanUsers.length,
        qualified: 0,
        total: 0,
        unallocated: unallocatedIndications.length,
        verified: 0,
      },
    };
  }

  const [people, orphanUsers, unallocatedIndications] = await Promise.all([
    buildNetworkTree(rootUser, maxDepth),
    findOrphanUsers(rootUser.id),
    findUnallocatedIndications(),
  ]);
  const levels = Array.from({ length: maxDepth }, (_, index) => {
    const level = index + 1;
    const levelPeople = people.filter((person) => person.level === level);

    return {
      left: levelPeople.filter((person) => person.branch === "ESQUERDA").length,
      level,
      right: levelPeople.filter((person) => person.branch === "DIREITA").length,
      total: levelPeople.length,
    };
  });

  return {
    diagnostics: {
      orphanUsers,
      unallocatedIndications,
    },
    levels,
    people,
    root: serializeUser(rootUser),
    summary: {
      active: people.filter((person) => person.active).length,
      directToRoot: people.filter((person) => person.isDirectToRoot).length,
      maxDepth,
      orphans: orphanUsers.length,
      qualified: people.filter((person) => person.qualified).length,
      earningsBlocked: people.filter((person) => person.networkEarningsBlocked).length,
      total: people.length,
      unallocated: unallocatedIndications.length,
      verified: people.filter((person) => person.verified).length,
    },
  };
}

export async function updateAdminNetworkEarnings(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const companyRoot = await findCompanyRoot();
  if (!companyRoot) throw new AppError("Raiz da empresa nao encontrada", 409);
  if (parsedUserId === companyRoot.id) {
    throw new AppError("Os ganhos da raiz operacional nao podem ser alterados", 409);
  }

  await adminNetworkRepository.transaction(async (database) => {
    const repository = createAdminNetworkRepository(database);
    const participant = await repository.findPlacementUser(parsedUserId);
    if (!participant) throw new AppError("Participante nao encontrado", 404);

    await repository.updateNetworkEarnings(parsedUserId, {
      ganhos_rede_bloqueados: data.blocked,
      ganhos_rede_bloqueados_em: data.blocked ? new Date() : null,
      motivo_bloqueio_ganhos_rede: data.blocked ? data.reason : null,
    });
    await repository.createAudit({
      acao: data.blocked ? "GANHOS_REDE_BLOQUEADOS" : "GANHOS_REDE_LIBERADOS",
      administrador_id: adminId,
      dados_json: { blocked: data.blocked, reason: data.reason },
      usuario_alvo_id: parsedUserId,
    });
  });

  return getAdminNetworkOverview({ maxDepth: 20 });
}

function buildPlacementGraph(placements) {
  const byUser = new Map(placements.map((placement) => [placement.indicado_usuario_id, placement]));
  const childrenByParent = new Map();

  for (const placement of placements) {
    if (!placement.alocado_sob_usuario_id) continue;
    const children = childrenByParent.get(placement.alocado_sob_usuario_id) ?? [];
    children.push(placement.indicado_usuario_id);
    childrenByParent.set(placement.alocado_sob_usuario_id, children);
  }

  return { byUser, childrenByParent };
}

function collectSubtree(rootUserId, childrenByParent) {
  const levels = new Map([[rootUserId, 0]]);
  const queue = [rootUserId];

  while (queue.length) {
    const parentId = queue.shift();
    const parentLevel = levels.get(parentId);
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (levels.has(childId)) continue;
      levels.set(childId, parentLevel + 1);
      queue.push(childId);
    }
  }

  return levels;
}

function depthFromRoot(userId, rootId, byUser) {
  if (userId === rootId) return 0;

  const visited = new Set();
  let currentId = userId;
  let depth = 0;

  while (currentId !== rootId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const placement = byUser.get(currentId);
    if (!placement?.alocado_sob_usuario_id) return null;
    currentId = placement.alocado_sob_usuario_id;
    depth += 1;
    if (depth > 20) return null;
  }

  return depth;
}

export async function moveAdminNetworkPlacement(adminId, userId, data) {
  const movedUserId = parsePositiveId(userId, "Participante invalido");
  const parentUserId = parsePositiveId(data.parentUserId, "Destino invalido");

  if (movedUserId === parentUserId) {
    throw new AppError("O participante nao pode ser alocado sob ele mesmo", 409);
  }

  const companyRoot = await findCompanyRoot();
  if (!companyRoot) throw new AppError("Raiz da empresa nao encontrada", 409);
  if (movedUserId === companyRoot.id) throw new AppError("A raiz da empresa nao pode ser movida", 409);

  try {
    await adminNetworkRepository.transaction(async (database) => {
      const repository = createAdminNetworkRepository(database);
      await repository.lockMatrix();

      const [placement, parent, placements] = await Promise.all([
        repository.findPlacementByUser(movedUserId),
        repository.findPlacementUser(parentUserId),
        repository.listPlacements(),
      ]);

      if (!placement) throw new AppError("Participante ainda nao possui posicao na matriz", 404);
      if (!parent) throw new AppError("Participante de destino nao encontrado", 404);

      const { byUser, childrenByParent } = buildPlacementGraph(placements);
      const subtree = collectSubtree(movedUserId, childrenByParent);
      if (subtree.has(parentUserId)) {
        throw new AppError("O destino esta dentro da subarvore movida e criaria um ciclo", 409);
      }

      const occupied = placements.find(
        (item) =>
          item.indicado_usuario_id !== movedUserId &&
          item.alocado_sob_usuario_id === parentUserId &&
          item.posicao_matriz === data.position,
      );
      if (occupied) {
        throw new AppError(`A posicao ${sideLabel(data.position).toLowerCase()} desse participante ja esta ocupada`, 409);
      }

      const parentDepth = depthFromRoot(parentUserId, companyRoot.id, byUser);
      if (parentDepth === null) {
        throw new AppError("O destino nao esta conectado a raiz real da empresa", 409);
      }

      const subtreeHeight = Math.max(...subtree.values());
      const movedDepth = parentDepth + 1;
      if (movedDepth + subtreeHeight > 20) {
        throw new AppError("A mudanca ultrapassaria o limite de 20 niveis da matriz", 409);
      }

      await repository.updatePlacement(placement.id, {
        alocado_sob_usuario_id: parentUserId,
        nivel_matriz: movedDepth,
        posicao_matriz: data.position,
      });

      for (const [descendantUserId, relativeDepth] of subtree.entries()) {
        if (descendantUserId === movedUserId) continue;
        const descendant = byUser.get(descendantUserId);
        if (descendant) {
          await repository.updatePlacement(descendant.id, {
            nivel_matriz: movedDepth + relativeDepth,
          });
        }
      }

      await repository.createAudit({
        acao: "POSICAO_REDE_ALTERADA",
        administrador_id: adminId,
        dados_json: {
          fromParentUserId: placement.alocado_sob_usuario_id,
          fromPosition: placement.posicao_matriz,
          reason: data.reason,
          toParentUserId: parentUserId,
          toPosition: data.position,
        },
        usuario_alvo_id: movedUserId,
      });
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("A posicao escolhida acabou de ser ocupada. Atualize a rede.", 409);
    }
    throw error;
  }

  console.info("[admin-network] placement moved", {
    adminId,
    movedUserId,
    parentUserId,
    position: data.position,
    reason: data.reason,
  });

  return getAdminNetworkOverview({ maxDepth: 20 });
}
