CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Immutable normalization allows expression indexes, without storing a second catalog.
CREATE OR REPLACE FUNCTION marketplace_search_normalize(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(translate(lower(coalesce(value, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE INDEX marketplace_store_name_trgm ON lojas USING gin
  (marketplace_search_normalize(nome) gin_trgm_ops) WHERE excluido_em IS NULL;
CREATE INDEX marketplace_product_name_trgm ON produtos_loja USING gin
  (marketplace_search_normalize(nome || ' ' || coalesce(marca, '')) gin_trgm_ops) WHERE excluido_em IS NULL;
CREATE INDEX marketplace_category_name_trgm ON categorias_loja USING gin
  (marketplace_search_normalize(nome) gin_trgm_ops) WHERE excluido_em IS NULL;
CREATE INDEX marketplace_service_name_trgm ON tipos_servico USING gin
  (marketplace_search_normalize(nome) gin_trgm_ops) WHERE excluido_em IS NULL;
