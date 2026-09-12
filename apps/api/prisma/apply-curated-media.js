import { access } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/config/prisma.js";
import { uploadsBasePath, uploadsRoot } from "../src/config/storage.js";

const categoryAssets = [
  { file: "categories/restaurantes.webp", names: ["Restaurante", "Restaurantes"] },
  { file: "categories/mercados.webp", names: ["Mercados"] },
  { file: "categories/farmacias.webp", names: ["Farmacias"] },
  { file: "categories/conveniencias.webp", names: ["Conveniencias"] },
  { file: "categories/servicos.webp", names: ["Servicos"] },
  { file: "categories/moda.webp", names: ["Moda"] },
  { file: "categories/pet.webp", names: ["Pet"] },
  { file: "categories/beleza.webp", names: ["Beleza"] },
  { file: "categories/casa.webp", names: ["Casa"] },
  { file: "categories/eletronicos.webp", names: ["Eletronicos"] },
  { file: "categories/outros.webp", names: ["Outros"] },
];

const storeAssets = [
  { banner: "stores/demo-cafe-central/banner.webp", logo: "categories/restaurantes.webp", names: ["Cafe Central", "Cafe Central Demo"] },
  { banner: "stores/demo-mercado-bom-preco/banner.webp", logo: "categories/mercados.webp", names: ["Mercado Bom Preco", "Mercado Bom Preco Demo"] },
  { banner: "stores/demo-farma-mais/banner.webp", logo: "categories/farmacias.webp", names: ["Farma Mais", "Farma Mais Demo"] },
  { banner: "stores/loja-de-roupas-melo/banner.webp", logo: "categories/moda.webp", names: ["LOJA DE ROUPAS MELO", "Loja Melo", "Loja Melo Demo"] },
  { banner: "stores/demo-studio-bella/banner.webp", logo: "categories/beleza.webp", names: ["Studio Bella", "Studio Bella Demo"] },
  { banner: "stores/mercado-pires/banner.webp", logo: "categories/casa.webp", names: ["Mercado pires"] },
  { banner: "stores/loja-de-informatica/banner.webp", logo: "categories/eletronicos.webp", names: ["Loja de Informatica"] },
  { banner: "stores/mercado-pires/banner.webp", logo: "categories/casa.webp", names: ["Casa Forte Materiais"] },
  { banner: "stores/fretes-jose/banner.webp", logo: "categories/servicos.webp", names: ["FRETES JOSE"] },
];

const productAssets = [
  { file: "products/produto-teste.webp", names: ["Produto Teste"] },
  { file: "products/marmita-executiva.webp", names: ["Marmita Executiva"] },
  { file: "products/combo-cafe-central.webp", names: ["Combo Cafe Central"] },
  { file: "products/combo-limpeza.webp", names: ["Combo Limpeza"] },
  { file: "products/kit-hortifruti.webp", names: ["Kit Hortifruti"] },
  { file: "products/protetor-solar.webp", names: ["Protetor Solar"] },
  { file: "products/kit-higiene.webp", names: ["Kit Higiene"] },
  { file: "products/vitamina-c.webp", names: ["Vitamina C"] },
  { file: "products/kit-acessorios.webp", names: ["Kit Acessorios"] },
  { file: "products/camiseta-premium.webp", names: ["Camiseta Premium"] },
  { file: "products/bolsa-casual.webp", names: ["Bolsa Casual"] },
  { file: "products/escova-modelada.webp", names: ["Escova Modelada"] },
  { file: "products/design-de-sobrancelha.webp", names: ["Design de Sobrancelha"] },
  { file: "products/telha.webp", names: ["telha", "Telha Ceramica"] },
  { file: "products/ceramica.webp", names: ["ceramica", "Piso Ceramico"] },
  { file: "products/carregador.webp", names: ["Carregador", "Carregador Turbo USB-C"] },
  { file: "products/porcelanato.webp", names: ["porcelanato", "Porcelanato Acetinado"] },
  { file: "products/cesta-basica-compacta.webp", names: ["Cesta Basica Compacta"] },
  { file: "products/burger-artesanal.webp", names: ["Burger Artesanal"] },
  { file: "products/kit-skincare.webp", names: ["Kit Skincare"] },
];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function publicPath(relativePath) {
  return `${uploadsBasePath}/curated/${relativePath.replaceAll("\\", "/")}`;
}

async function assertAssetsExist() {
  const files = new Set([
    ...categoryAssets.map((asset) => asset.file),
    ...storeAssets.flatMap((asset) => [asset.banner, asset.logo]),
    ...productAssets.map((asset) => asset.file),
  ]);

  await Promise.all(
    [...files].map((file) => access(path.resolve(uploadsRoot, "curated", file))),
  );
}

function matches(recordName, expectedNames) {
  const normalizedName = normalize(recordName);
  return expectedNames.some((name) => normalize(name) === normalizedName);
}

async function applyCategories(database) {
  const categories = await database.categoriaLoja.findMany({
    select: { id: true, nome: true },
    where: { excluido_em: null },
  });
  let updated = 0;

  for (const asset of categoryAssets) {
    for (const category of categories.filter((item) => matches(item.nome, asset.names))) {
      await database.categoriaLoja.update({
        data: { icone_url: publicPath(asset.file) },
        where: { id: category.id },
      });
      updated += 1;
    }
  }

  return updated;
}

async function applyStores(database) {
  const stores = await database.loja.findMany({
    select: { id: true, nome: true },
    where: { excluido_em: null },
  });
  let updated = 0;

  for (const asset of storeAssets) {
    for (const store of stores.filter((item) => matches(item.nome, asset.names))) {
      await database.loja.update({
        data: {
          banner_url: publicPath(asset.banner),
          logo_url: publicPath(asset.logo),
        },
        where: { id: store.id },
      });
      updated += 1;
    }
  }

  return updated;
}

async function applyProducts(database) {
  const products = await database.produtoLoja.findMany({
    select: { id: true, nome: true },
    where: { excluido_em: null },
  });
  let updated = 0;

  for (const asset of productAssets) {
    for (const product of products.filter((item) => matches(item.nome, asset.names))) {
      await database.produtoLoja.update({
        data: { imagem_url: publicPath(asset.file) },
        where: { id: product.id },
      });
      updated += 1;
    }
  }

  return updated;
}

async function main() {
  await assertAssetsExist();

  const result = await prisma.$transaction(async (database) => ({
    categories: await applyCategories(database),
    products: await applyProducts(database),
    stores: await applyStores(database),
  }));

  console.log(
    `Midia curada aplicada: ${result.categories} categoria(s), ${result.stores} loja(s) e ${result.products} produto(s).`,
  );
}

main()
  .catch((error) => {
    console.error("Nao foi possivel aplicar a midia curada.", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
