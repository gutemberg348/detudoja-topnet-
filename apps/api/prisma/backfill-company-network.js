import { randomUUID } from "crypto";
import argon2 from "argon2";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";

const visibleStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];

function indicationTypeFromAccountType(accountType) {
  if (accountType === "LOJISTA") {
    return "LOJISTA";
  }

  if (accountType === "VENDEDOR") {
    return "VENDEDOR";
  }

  return "CONSUMIDOR";
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
        status: { in: visibleStatuses },
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

  throw new Error("A matriz 2x20 da empresa esta completa");
}

async function main() {
  const companyEmail = env.companyRoot.email.trim().toLowerCase();

  const result = await prisma.$transaction(async (database) => {
    const companyRoot = await ensureCompanyRootUser(database);
    const orphanUsers = await database.usuario.findMany({
      orderBy: { criado_em: "asc" },
      select: {
        email: true,
        id: true,
        nome: true,
        tipo_conta: true,
      },
      where: {
        email: { not: companyEmail },
        excluido_em: null,
        indicacao_recebida: null,
        tipo_conta: { not: "ADMIN" },
      },
    });
    let created = 0;

    for (const user of orphanUsers) {
      const placement = await findMatrixPlacement(database, companyRoot.id);

      await database.indicacao.create({
        data: {
          alocado_sob_usuario_id: placement.parentUserId,
          indicado_usuario_id: user.id,
          indicador_usuario_id: companyRoot.id,
          nivel_matriz: placement.level,
          origem: "backfill_empresa",
          posicao_matriz: placement.position,
          status: "PENDENTE",
          tipo_indicacao: indicationTypeFromAccountType(user.tipo_conta),
        },
      });
      created += 1;
    }

    return {
      companyRootEmail: companyRoot.email,
      created,
      inspected: orphanUsers.length,
    };
  });

  console.log(
    `Backfill da rede empresa finalizado: ${result.created}/${result.inspected} usuarios posicionados abaixo de ${result.companyRootEmail}.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
