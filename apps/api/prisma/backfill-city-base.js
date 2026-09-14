import { prisma } from "../src/config/prisma.js";

const patosPbAddress = {
  bairro: "Centro",
  cep: "58700000",
  cidade: "Patos",
  cidade_normalizada: "patos",
  estado: "PB",
  numero: "0",
  rua: "Centro",
};

async function backfillUserAddresses(database) {
  const users = await database.usuario.findMany({
    select: { id: true },
    where: {
      enderecos: { none: { excluido_em: null } },
      excluido_em: null,
    },
  });

  if (users.length > 0) {
    await database.enderecoUsuario.createMany({
      data: users.map((user) => ({
        ...patosPbAddress,
        nome_endereco: "Endereco principal",
        principal: true,
        usuario_id: user.id,
      })),
    });
  }

  return users.length;
}

async function backfillStoreAddresses(database) {
  const stores = await database.loja.findMany({
    select: { id: true },
    where: {
      endereco: { is: null },
      excluido_em: null,
    },
  });

  if (stores.length > 0) {
    await database.enderecoLoja.createMany({
      data: stores.map((store) => ({
        ...patosPbAddress,
        loja_id: store.id,
      })),
    });
  }

  return stores.length;
}

async function main() {
  const { stores, users } = await prisma.$transaction(async (database) => ({
    stores: await backfillStoreAddresses(database),
    users: await backfillUserAddresses(database),
  }));

  console.log(`Cidade-base Patos/PB aplicada a ${users} usuario(s) e ${stores} loja(s) sem endereco.`);
}

main()
  .catch((error) => {
    console.error("Falha ao preencher cidade-base:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
