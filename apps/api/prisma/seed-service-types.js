import { prisma } from "../src/config/prisma.js";

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const serviceTypes = [
  ["Frete", "Transporte de cargas e mudancas negociado pelo chat.", "car", "GERAL", {
    requiresDriverLicense: true,
    requiresPlate: true,
    requiresVehicle: true,
    vehicleKinds: ["CARRO", "UTILITARIO", "CAMINHAO"],
  }],
  ["Motoboy", "Corridas e entregas locais solicitadas por clientes ou lojas.", "bicycle", "ENTREGA_LOCAL", {
    requiresDriverLicense: true,
    requiresPlate: true,
    requiresVehicle: true,
    vehicleKinds: ["MOTO"],
  }],
];

async function main() {
  const servicesSegment = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: { excluido_em: null, slug: "servicos", status: "ATIVO" },
  });

  if (!servicesSegment) {
    throw new Error("Crie e ative o segmento Servicos no admin antes de cadastrar os tipos.");
  }

  // "Entregador" foi a primeira nomenclatura da entrega local. Motoboy e o
  // unico tipo operacional agora; o registro legado fica preservado, inativo
  // e sem apagar servicos ou conversas ja vinculados a ele.
  await prisma.tipoServico.updateMany({
    data: { status: "INATIVO" },
    where: { excluido_em: null, slug: "entregador" },
  });

  for (const [index, [name, description, icon, operationalType, requirements]] of serviceTypes.entries()) {
    await prisma.tipoServico.upsert({
      create: {
        descricao: description,
        icone: icon,
        modo_atendimento: "NEGOCIACAO_CHAT",
        nome: name,
        ordem: index + 1,
        requisitos_cadastro: requirements,
        segmento_venda_id: servicesSegment.id,
        slug: slugify(name),
        status: "ATIVO",
        tipo_operacao: operationalType,
      },
      update: {
        descricao: description,
        icone: icon,
        modo_atendimento: "NEGOCIACAO_CHAT",
        ordem: index + 1,
        requisitos_cadastro: requirements,
        segmento_venda_id: servicesSegment.id,
        status: "ATIVO",
        tipo_operacao: operationalType,
      },
      where: { slug: slugify(name) },
    });
  }
}

main()
  .then(() => console.log("Tipos de servico atualizados: Frete e Motoboy. Entregador foi inativado como legado."))
  .finally(() => prisma.$disconnect());
