import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

const visibleIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];
const qualificationInclude = {
  indicacoes_feitas: {
    include: { indicado: { include: { kyc: true } } },
    where: { status: { in: visibleIndicationStatuses } },
  },
  kyc: true,
};

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
    id: user.id,
    indicationStatus: context.indicationStatus ?? null,
    isDirectToRoot: context.directSponsorId === context.rootUserId,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    level: context.level ?? 0,
    name: user.nome,
    parentEmail: context.parentEmail ?? null,
    parentConnectionType,
    parentId: context.parentId ?? null,
    parentName: context.parentName ?? null,
    parentSide: context.parentSide ?? sideLabel(context.position),
    phone: user.telefone,
    position: context.position ?? null,
    qualified: active && verified && activeVerifiedDirects >= 2,
    reward: {
      direct: parentConnectionType === "DIRETA",
      network: parentConnectionType !== "RAIZ",
    },
    status: user.status,
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
  return prisma.usuario.findUnique({
    include: qualificationInclude,
    where: { email: env.companyRoot.email.trim().toLowerCase() },
  });
}

async function findMatrixChildren(parentIds) {
  return prisma.indicacao.findMany({
    include: {
      alocado_sob: { select: { email: true, id: true, nome: true } },
      indicado: { include: qualificationInclude },
      indicador: { select: { email: true, id: true, nome: true } },
    },
    orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
    where: {
      alocado_sob_usuario_id: { in: parentIds },
      status: { in: visibleIndicationStatuses },
    },
  });
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
  const users = await prisma.usuario.findMany({
    orderBy: { criado_em: "asc" },
    select: {
      criado_em: true,
      email: true,
      id: true,
      nome: true,
      status: true,
      tipo_conta: true,
    },
    where: {
      excluido_em: null,
      id: { not: rootUserId },
      indicacao_recebida: null,
      tipo_conta: { not: "ADMIN" },
    },
  });

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
  const indications = await prisma.indicacao.findMany({
    include: {
      indicado: { select: { email: true, id: true, nome: true } },
      indicador: { select: { email: true, id: true, nome: true } },
    },
    orderBy: { criado_em: "asc" },
    take: 50,
    where: {
      alocado_sob_usuario_id: null,
      status: { in: visibleIndicationStatuses },
    },
  });

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
    ? await prisma.usuario.findUnique({
        include: qualificationInclude,
        where: { id: rootUserId },
      })
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
      total: people.length,
      unallocated: unallocatedIndications.length,
      verified: people.filter((person) => person.verified).length,
    },
  };
}
