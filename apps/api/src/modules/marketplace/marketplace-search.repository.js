import { prisma } from "../../config/prisma.js";
import { normalizeLocation } from "../../utils/location.js";

// SQL fragments below are constants. User text, city and state are bound parameters.
export function localPublicStoreSql(city = "$2", state = "$3", rawCity = "$4") {
  return `l.excluido_em IS NULL AND l.status = 'ATIVA' AND l.visivel_no_app
  AND EXISTS (SELECT 1 FROM enderecos_loja e WHERE e.loja_id = l.id
    AND (e.cidade_normalizada = ${city} OR lower(e.cidade) = lower(${rawCity})) AND e.estado = ${state})
  AND EXISTS (SELECT 1 FROM lojistas owner JOIN usuarios u ON u.id = owner.usuario_id
    JOIN kyc_usuarios k ON k.usuario_id = u.id
    WHERE owner.id = l.lojista_id AND owner.status = 'ATIVO' AND owner.status_kyc = 'APROVADO'
      AND u.excluido_em IS NULL AND u.status = 'ATIVO' AND u.nivel_kyc = 'TIER_2' AND k.status = 'APROVADO')`;
}

export function localAvailableServiceSql(city = "$2", state = "$3", rawCity = "$4") {
  return `t.excluido_em IS NULL AND t.status = 'ATIVO' AND t.slug <> 'entregador'
    AND EXISTS (SELECT 1 FROM servicos_vendedor s JOIN vendedores v ON v.id = s.vendedor_id
      JOIN usuarios u ON u.id = v.usuario_id JOIN kyc_usuarios k ON k.usuario_id = u.id
      WHERE s.tipo_servico_id = t.id AND s.excluido_em IS NULL AND s.status = 'ATIVO' AND s.disponivel_agora
        AND v.excluido_em IS NULL AND v.status IN ('ATIVO', 'PENDENTE') AND v.status_kyc = 'APROVADO'
        AND u.excluido_em IS NULL AND u.status = 'ATIVO' AND u.nivel_kyc = 'TIER_2' AND k.status = 'APROVADO'
        AND EXISTS (SELECT 1 FROM enderecos_usuario e WHERE e.usuario_id = u.id AND e.excluido_em IS NULL
          AND (e.cidade_normalizada = ${city} OR lower(e.cidade) = lower(${rawCity})) AND e.estado = ${state}))`;
}

const localPublicStore = localPublicStoreSql();

const sources = [
  { from: "lojas l", name: "l.nome", where: localPublicStore },
  { from: "produtos_loja p JOIN lojas l ON l.id = p.loja_id", name: "p.nome || ' ' || coalesce(p.marca, '')",
    where: `p.excluido_em IS NULL AND p.status = 'ATIVO' AND ${localPublicStore}` },
  { from: "categorias_loja c", name: "c.nome", where: `c.excluido_em IS NULL AND c.status = 'ATIVA'
    AND EXISTS (SELECT 1 FROM lojas l WHERE l.categoria_id = c.id AND ${localPublicStore})` },
  { from: "tipos_servico t", name: "t.nome", where: localAvailableServiceSql() },
];

export const marketplaceSearchRepository = {
  async candidateLabels(tokens, address) {
    const terms = [...new Set(tokens.filter((term) => term.length >= 4 && !/\d/.test(term)))].slice(0, 8);
    if (!terms.length) return [];
    return prisma.$transaction(async (tx) => {
      // Local to this transaction/connection; never changes a pooled connection globally.
      await tx.$executeRawUnsafe("SET LOCAL pg_trgm.word_similarity_threshold = 0.18");
      const rows = [];
      for (const source of sources) {
        const name = `marketplace_search_normalize(${source.name})`;
        const matches = await tx.$queryRawUnsafe(`
          SELECT candidate.label FROM unnest($1::text[]) term
          CROSS JOIN LATERAL (
            SELECT DISTINCT ${name} AS label, word_similarity(term, ${name}) AS score
            FROM ${source.from} WHERE ${source.where} AND ${name} %> term
            ORDER BY score DESC, label ASC LIMIT 32
          ) candidate`, terms, normalizeLocation(address.cidade ?? address.city), String(address.estado ?? address.state).trim().toUpperCase(), String(address.cidade ?? address.city).trim());
        rows.push(...matches);
      }
      return [...new Set(rows.map((row) => row.label))];
    }, { timeout: 10000 });
  },
};
