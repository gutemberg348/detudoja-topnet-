import { prisma } from "../src/config/prisma.js";

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function availableSlug(name, categoryId) {
  const base = slugify(name) || `segmento-${categoryId}`;
  const existing = await prisma.segmentoVenda.findUnique({
    select: { categoria_loja_id: true, id: true },
    where: { slug: base },
  });

  if (!existing || existing.categoria_loja_id === categoryId) {
    return base;
  }

  return `${base}-categoria-${categoryId}`;
}

async function createCategorySegment(category, sourceSegment = null) {
  const slug = await availableSlug(category.nome, category.id);
  const existing = await prisma.segmentoVenda.findUnique({ where: { slug } });

  if (existing) {
    return prisma.segmentoVenda.update({
      data: {
        categoria_loja_id: category.id,
        excluido_em: null,
        status: "ATIVO",
      },
      where: { id: existing.id },
    });
  }

  return prisma.segmentoVenda.create({
    data: {
      categoria_loja_id: category.id,
      descricao: sourceSegment?.descricao ?? category.descricao,
      icone: sourceSegment?.icone ?? null,
      nome: category.nome,
      negocia_pedido_por_chat: category.negocia_pedido_por_chat,
      ordem: sourceSegment?.ordem ?? 0,
      percentual_cashback: sourceSegment?.percentual_cashback ?? null,
      percentual_indicacao_consumidor:
        sourceSegment?.percentual_indicacao_consumidor ?? null,
      percentual_indicacao_vendedor:
        sourceSegment?.percentual_indicacao_vendedor ?? null,
      percentual_rede: sourceSegment?.percentual_rede ?? null,
      slug,
      status: "ATIVO",
      taxa_plataforma_percentual:
        sourceSegment?.taxa_plataforma_percentual
        ?? category.taxa_plataforma_percentual,
    },
  });
}

async function backfillCategoriesAndStores() {
  const categories = await prisma.categoriaLoja.findMany({
    include: {
      segmento_venda: true,
      segmentos_venda: {
        orderBy: [{ ordem: "asc" }, { id: "asc" }],
        where: { excluido_em: null },
      },
    },
    orderBy: { id: "asc" },
    where: { excluido_em: null },
  });

  for (const category of categories) {
    let segment = category.segmentos_venda[0] ?? null;
    const legacySegment = category.segmento_venda;

    if (!segment && legacySegment && !legacySegment.categoria_loja_id) {
      segment = await prisma.segmentoVenda.update({
        data: {
          categoria_loja_id: category.id,
          negocia_pedido_por_chat: category.negocia_pedido_por_chat,
        },
        where: { id: legacySegment.id },
      });
    }

    if (!segment && legacySegment?.categoria_loja_id === category.id) {
      segment = legacySegment;
    }

    if (!segment) {
      segment = await createCategorySegment(category, legacySegment);
    }

    await prisma.$transaction([
      prisma.categoriaLoja.update({
        data: { segmento_venda_id: segment.id },
        where: { id: category.id },
      }),
      prisma.loja.updateMany({
        data: { segmento_venda_id: segment.id },
        where: { categoria_id: category.id, segmento_venda_id: null },
      }),
    ]);
  }
}

async function attachUnclassifiedSegments() {
  const segments = await prisma.segmentoVenda.findMany({
    select: { id: true },
    where: { categoria_loja_id: null, excluido_em: null },
  });

  if (!segments.length) {
    return;
  }

  let fallbackCategory = await prisma.categoriaLoja.findFirst({
    where: {
      excluido_em: null,
      nome: { equals: "Outros", mode: "insensitive" },
    },
  });

  if (!fallbackCategory) {
    fallbackCategory = await prisma.categoriaLoja.create({
      data: {
        descricao: "Atividades ainda nao agrupadas em uma categoria especifica.",
        nome: "Outros",
        status: "ATIVA",
      },
    });
  }

  await prisma.segmentoVenda.updateMany({
    data: { categoria_loja_id: fallbackCategory.id },
    where: { id: { in: segments.map((segment) => segment.id) } },
  });
}

async function main() {
  await backfillCategoriesAndStores();
  await attachUnclassifiedSegments();
  console.log("Categorias, segmentos e lojas classificados com sucesso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
