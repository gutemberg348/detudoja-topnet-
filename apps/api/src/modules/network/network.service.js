import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import {
  countActiveVerifiedDirects,
  isQualifiedForNetwork,
  networkQualificationInclude,
  qualifyingIndicationStatuses,
} from "./network.qualification.js";

function serializePerson(
  user,
  {
    branch = null,
    directSponsorId = null,
    directSponsorName = null,
    indicationStatus = null,
    isDirectIndication = false,
    isMatrixDirect = false,
    level = 0,
    parentId = null,
    position = null,
  } = {},
) {
  const active = user.status === "ATIVO";
  const verified = user.kyc?.status === "APROVADO";
  const qualifiedDirects = countActiveVerifiedDirects(user);
  const placementType =
    level === 0 ? "RAIZ" : isDirectIndication ? "DIRETO" : "DERRAMAMENTO";
  const connectionType =
    level === 0 ? "RAIZ" : isDirectIndication ? "DIRETA" : "REDE";

  return {
    accountType: user.tipo_conta,
    active,
    activeVerifiedDirects: qualifiedDirects,
    branch,
    createdAt: user.criado_em.toISOString(),
    directSponsorId,
    directSponsorName,
    id: user.id,
    indicationStatus,
    isDirectIndication,
    isMatrixDirect,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    level,
    name: user.nome,
    parentId,
    placementType,
    connectionType,
    position,
    qualified: isQualifiedForNetwork(user),
    reward: {
      direct: connectionType === "DIRETA",
      network: connectionType !== "RAIZ",
    },
    status: user.status,
    verified,
  };
}

async function ensureInviteCode(userId) {
  const existingCode = await prisma.codigoConvite.findFirst({
    orderBy: { criado_em: "desc" },
    where: { ativo: true, usuario_id: userId },
  });

  if (existingCode) {
    return existingCode;
  }

  return prisma.codigoConvite.create({
    data: {
      codigo: `DTJ-${String(userId).padStart(6, "0")}`,
      usuario_id: userId,
    },
  });
}

async function findMatrixChildren(parentIds) {
  const include = {
    indicado: { include: networkQualificationInclude },
    indicador: { select: { id: true, nome: true } },
  };
  const orderBy = [{ posicao_matriz: "asc" }, { criado_em: "asc" }];

  return prisma.indicacao.findMany({
    include,
    orderBy,
    where: {
      alocado_sob_usuario_id: { in: parentIds },
      status: { in: qualifyingIndicationStatuses },
    },
  });
}

async function buildAllocatedMatrixForRoot(rootUserId) {
  const people = [];
  const visited = new Set([rootUserId]);
  let frontier = [{ branch: null, userId: rootUserId }];

  for (let level = 1; level <= 20 && frontier.length > 0; level += 1) {
    const parentIds = frontier.map((node) => node.userId);
    const parentById = new Map(frontier.map((node) => [node.userId, node]));
    const indications = await findMatrixChildren(parentIds);
    const nextFrontier = [];

    for (const indication of indications) {
      if (visited.has(indication.indicado_usuario_id)) {
        continue;
      }

      const parentId = indication.alocado_sob_usuario_id ?? indication.indicador_usuario_id;
      const parent = parentById.get(parentId);

      if (!parent) {
        continue;
      }

      visited.add(indication.indicado_usuario_id);

      const position = indication.posicao_matriz ?? 1;
      const branch =
        parent.branch ?? (position === 1 ? "ESQUERDA" : "DIREITA");

      people.push(
        serializePerson(indication.indicado, {
          branch,
          directSponsorId: indication.indicador_usuario_id,
          directSponsorName: indication.indicador?.nome ?? null,
          indicationStatus: indication.status,
          isDirectIndication: indication.indicador_usuario_id === rootUserId,
          isMatrixDirect: parentId === rootUserId,
          level,
          parentId,
          position,
        }),
      );

      nextFrontier.push({
        branch,
        userId: indication.indicado_usuario_id,
      });
    }

    frontier = nextFrontier;
  }

  return people;
}

function buildVirtualMatrixPeople(indications, rootUserId, networkRootUserId = rootUserId) {
  const people = [];
  const slots = [
    {
      branch: null,
      children: 0,
      level: 0,
      userId: rootUserId,
    },
  ];

  for (const indication of indications) {
    const parent = slots.find((slot) => slot.children < 2);

    if (!parent || parent.level >= 20) {
      break;
    }

    parent.children += 1;
    const position = parent.children;
    const level = parent.level + 1;
    const branch =
      parent.branch ?? (position === 1 ? "ESQUERDA" : "DIREITA");

    people.push(
      serializePerson(indication.indicado, {
        branch,
        directSponsorId: indication.indicador_usuario_id,
        directSponsorName: indication.indicador?.nome ?? null,
        indicationStatus: indication.status,
        isDirectIndication: indication.indicador_usuario_id === networkRootUserId,
        isMatrixDirect: parent.userId === networkRootUserId,
        level,
        parentId: parent.userId,
        position,
      }),
    );

    slots.push({
      branch,
      children: 0,
      level,
      userId: indication.indicado_usuario_id,
    });
  }

  return people;
}

function extractSubtreePeople(people, subtreeRootUserId) {
  const childrenByParent = new Map();

  for (const person of people) {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person);
    childrenByParent.set(person.parentId, children);
  }

  childrenByParent.forEach((children) => {
    children.sort((first, second) => {
      if (first.position !== second.position) {
        return (first.position ?? 0) - (second.position ?? 0);
      }

      return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    });
  });

  const subtree = [];
  const queue = (childrenByParent.get(subtreeRootUserId) ?? []).map((person) => ({
    branch: person.position === 1 ? "ESQUERDA" : "DIREITA",
    level: 1,
    parentId: subtreeRootUserId,
    person,
  }));

  while (queue.length > 0) {
    const node = queue.shift();
    const directIndication = node.person.directSponsorId === subtreeRootUserId;
    const connectionType = directIndication ? "DIRETA" : "REDE";
    const cloned = {
      ...node.person,
      branch: node.branch,
      connectionType,
      isDirectIndication: directIndication,
      isMatrixDirect: node.parentId === subtreeRootUserId,
      level: node.level,
      parentId: node.parentId,
      placementType: directIndication ? "DIRETO" : "DERRAMAMENTO",
      reward: {
        direct: connectionType === "DIRETA",
        network: true,
      },
    };

    subtree.push(cloned);

    for (const child of childrenByParent.get(node.person.id) ?? []) {
      queue.push({
        branch: node.branch,
        level: node.level + 1,
        parentId: node.person.id,
        person: child,
      });
    }
  }

  return subtree;
}

function sortMatrixPeople(people) {
  return [...people].sort((first, second) => {
    if (first.level !== second.level) {
      return first.level - second.level;
    }

    if (first.branch !== second.branch) {
      return first.branch === "ESQUERDA" ? -1 : 1;
    }

    if (first.position !== second.position) {
      return (first.position ?? 0) - (second.position ?? 0);
    }

    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  });
}

async function findLegacyIndications(rootUserId) {
  return prisma.indicacao.findMany({
    include: {
      indicado: { include: networkQualificationInclude },
      indicador: { select: { id: true, nome: true } },
    },
    orderBy: [{ criado_em: "asc" }],
    where: {
      alocado_sob_usuario_id: null,
      indicador_usuario_id: rootUserId,
      status: { in: qualifyingIndicationStatuses },
    },
  });
}

async function findSponsorChain(userId) {
  const sponsors = [];
  const visited = new Set([userId]);
  let currentUserId = userId;

  for (let depth = 0; depth < 20; depth += 1) {
    const receivedIndication = await prisma.indicacao.findUnique({
      select: { indicador_usuario_id: true },
      where: { indicado_usuario_id: currentUserId },
    });
    const sponsorId = receivedIndication?.indicador_usuario_id;

    if (!sponsorId || visited.has(sponsorId)) {
      break;
    }

    sponsors.push(sponsorId);
    visited.add(sponsorId);
    currentUserId = sponsorId;
  }

  return sponsors;
}

async function buildLegacyMatrixForUser(userId) {
  const rootIds = [
    userId,
    ...(await findSponsorChain(userId)),
  ];
  const peopleById = new Map();

  for (const rootId of rootIds) {
    const indications = await findLegacyIndications(rootId);
    const virtualPeople = buildVirtualMatrixPeople(indications, rootId, rootId);
    const candidatePeople =
      rootId === userId
        ? virtualPeople
        : extractSubtreePeople(virtualPeople, userId);

    for (const person of candidatePeople) {
      if (!peopleById.has(person.id)) {
        peopleById.set(person.id, person);
      }
    }
  }

  return sortMatrixPeople([...peopleById.values()]);
}

async function buildSponsorAllocatedMatrixForUser(userId) {
  const peopleById = new Map();
  const sponsorIds = await findSponsorChain(userId);

  for (const sponsorId of sponsorIds) {
    const sponsorPeople = await buildAllocatedMatrixForRoot(sponsorId);
    const subtreePeople = extractSubtreePeople(sponsorPeople, userId);

    for (const person of subtreePeople) {
      peopleById.set(person.id, person);
    }
  }

  return sortMatrixPeople([...peopleById.values()]);
}

function mergeMatrixPeople(...peopleGroups) {
  const peopleById = new Map();

  for (const group of peopleGroups) {
    for (const person of group) {
      peopleById.set(person.id, person);
    }
  }

  return sortMatrixPeople([...peopleById.values()]);
}

export async function getNetworkOverview(userId) {
  const currentUser = await prisma.usuario.findUnique({
    include: networkQualificationInclude,
    where: { id: userId },
  });

  if (!currentUser) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const allocatedPeople = await buildAllocatedMatrixForRoot(userId);
  const sponsorAllocatedPeople = await buildSponsorAllocatedMatrixForUser(userId);
  const virtualPeople = await buildLegacyMatrixForUser(userId);
  const matrixPeople = mergeMatrixPeople(
    virtualPeople,
    sponsorAllocatedPeople,
    allocatedPeople,
  );

  const [invite, rewards] = await Promise.all([
    ensureInviteCode(userId),
    prisma.recompensa.findMany({
      orderBy: { criado_em: "desc" },
      take: 20,
      where: {
        tipo_recompensa: {
          in: [
            "BONUS_INDICACAO_CONSUMIDOR",
            "BONUS_INDICACAO_LOJISTA",
            "BONUS_VENDEDOR",
          ],
        },
        usuario_beneficiado_id: userId,
      },
    }),
  ]);
  const current = serializePerson(currentUser);
  const matrixLevels = Array.from({ length: 20 }, (_, index) => {
    const level = index + 1;
    const levelPeople = matrixPeople.filter((person) => person.level === level);
    return {
      capacity: 2 ** level,
      left: levelPeople.filter((person) => person.branch === "ESQUERDA").length,
      level,
      right: levelPeople.filter((person) => person.branch === "DIREITA").length,
      total: levelPeople.length,
    };
  });
  const networkPeople = matrixPeople.filter(
    (person) => person.connectionType === "REDE" || person.placementType === "DERRAMAMENTO",
  );

  return {
    currentUser: current,
    invite: {
      code: invite.codigo,
      message:
        "Entre para a minha rede DeTudoJa. A qualificacao depende de conta ativa e KYC aprovado.",
      totalUses: invite.usos_totais,
    },
    matrix: {
      levels: matrixLevels,
      maxDepth: 20,
      placementOrder: "BREADTH_FIRST_LEFT_TO_RIGHT",
      width: 2,
    },
    people: matrixPeople,
    qualification: {
      active: current.active,
      activeVerifiedDirects: current.activeVerifiedDirects,
      kycStatus: current.kycStatus,
      qualified: current.qualified,
      requiredActiveVerifiedDirects: 2,
      verified: current.verified,
    },
    rewards: rewards.map((reward) => ({
      createdAt: reward.criado_em.toISOString(),
      id: reward.id,
      reason: reward.motivo,
      status: reward.status,
      type: reward.tipo_recompensa,
      valueCents: Number(reward.valor_centavos),
    })),
    summary: {
      active: matrixPeople.filter((person) => person.active).length,
      direct: currentUser.indicacoes_feitas.length,
      network: networkPeople.length,
      spillover: networkPeople.length,
      qualified: matrixPeople.filter((person) => person.qualified).length,
      total: matrixPeople.length,
      verified: matrixPeople.filter((person) => person.verified).length,
    },
  };
}
