BEGIN;

DO $$
DECLARE
  "constraint_record" RECORD;
BEGIN
  FOR "constraint_record" IN
    SELECT
      "conrelid"::regclass AS "table_name",
      "conname" AS "constraint_name"
    FROM "pg_constraint"
    WHERE "contype" = 'f'
      AND (
        "conrelid" IN (
          '"lojistas"'::regclass,
          '"categorias_loja"'::regclass,
          '"lojas"'::regclass,
          '"produtos_loja"'::regclass
        )
        OR "confrelid" IN (
          '"lojistas"'::regclass,
          '"categorias_loja"'::regclass,
          '"lojas"'::regclass,
          '"produtos_loja"'::regclass
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      "constraint_record"."table_name",
      "constraint_record"."constraint_name"
    );
  END LOOP;
END $$;

ALTER SEQUENCE IF EXISTS "lojistas_id_seq" OWNED BY NONE;
ALTER SEQUENCE IF EXISTS "categorias_loja_id_seq" OWNED BY NONE;
ALTER SEQUENCE IF EXISTS "lojas_id_seq" OWNED BY NONE;
ALTER SEQUENCE IF EXISTS "produtos_loja_id_seq" OWNED BY NONE;

ALTER TABLE "lojistas" DROP CONSTRAINT IF EXISTS "lojistas_pkey";
ALTER TABLE "categorias_loja" DROP CONSTRAINT IF EXISTS "categorias_loja_pkey";
ALTER TABLE "lojas" DROP CONSTRAINT IF EXISTS "lojas_pkey";
ALTER TABLE "produtos_loja" DROP CONSTRAINT IF EXISTS "produtos_loja_pkey";

DROP INDEX IF EXISTS "lojistas_usuario_id_key";
DROP INDEX IF EXISTS "lojistas_cpf_idx";
DROP INDEX IF EXISTS "lojistas_cnpj_idx";
DROP INDEX IF EXISTS "lojistas_status_idx";
DROP INDEX IF EXISTS "lojistas_status_kyc_idx";

DROP INDEX IF EXISTS "categorias_loja_nome_idx";
DROP INDEX IF EXISTS "categorias_loja_status_idx";

DROP INDEX IF EXISTS "lojas_slug_key";
DROP INDEX IF EXISTS "lojas_lojista_id_idx";
DROP INDEX IF EXISTS "lojas_categoria_id_idx";
DROP INDEX IF EXISTS "lojas_status_idx";
DROP INDEX IF EXISTS "lojas_visivel_no_app_idx";

DROP INDEX IF EXISTS "produtos_loja_loja_id_idx";
DROP INDEX IF EXISTS "produtos_loja_status_idx";
DROP INDEX IF EXISTS "produtos_loja_destaque_idx";
DROP INDEX IF EXISTS "produtos_loja_ordem_idx";

ALTER TABLE "lojistas" RENAME TO "_reordenar_old_lojistas";
ALTER TABLE "categorias_loja" RENAME TO "_reordenar_old_categorias_loja";
ALTER TABLE "lojas" RENAME TO "_reordenar_old_lojas";
ALTER TABLE "produtos_loja" RENAME TO "_reordenar_old_produtos_loja";

CREATE SEQUENCE IF NOT EXISTS "lojistas_id_seq";
CREATE TABLE "lojistas" (
  "id" INTEGER NOT NULL DEFAULT nextval('"lojistas_id_seq"'::regclass),
  "usuario_id" UUID NOT NULL,
  "tipo_pessoa" "TipoPessoa" NOT NULL,
  "cpf" VARCHAR(14),
  "cnpj" VARCHAR(18),
  "razao_social" VARCHAR(180),
  "nome_fantasia" VARCHAR(180),
  "status_kyc" "StatusKyc" NOT NULL DEFAULT 'PENDENTE',
  "status" "StatusLojista" NOT NULL DEFAULT 'PENDENTE',
  "limite_faturamento_mensal_centavos" BIGINT,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
  "excluido_em" TIMESTAMPTZ(3),
  CONSTRAINT "lojistas_pkey" PRIMARY KEY ("id")
);

CREATE SEQUENCE IF NOT EXISTS "categorias_loja_id_seq";
CREATE TABLE "categorias_loja" (
  "id" INTEGER NOT NULL DEFAULT nextval('"categorias_loja_id_seq"'::regclass),
  "nome" VARCHAR(120) NOT NULL,
  "descricao" TEXT,
  "icone_url" TEXT,
  "status" "StatusCategoriaLoja" NOT NULL DEFAULT 'ATIVA',
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
  "excluido_em" TIMESTAMPTZ(3),
  CONSTRAINT "categorias_loja_pkey" PRIMARY KEY ("id")
);

CREATE SEQUENCE IF NOT EXISTS "lojas_id_seq";
CREATE TABLE "lojas" (
  "id" INTEGER NOT NULL DEFAULT nextval('"lojas_id_seq"'::regclass),
  "lojista_id" INTEGER NOT NULL,
  "nome" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "descricao" TEXT,
  "categoria_id" INTEGER NOT NULL,
  "telefone" VARCHAR(30),
  "whatsapp" VARCHAR(30),
  "email" VARCHAR(255),
  "logo_url" TEXT,
  "banner_url" TEXT,
  "status" "StatusLoja" NOT NULL DEFAULT 'RASCUNHO',
  "visivel_no_app" BOOLEAN NOT NULL DEFAULT false,
  "aceita_pagamento_online" BOOLEAN NOT NULL DEFAULT false,
  "aceita_qrcode" BOOLEAN NOT NULL DEFAULT false,
  "taxa_plataforma_padrao_percentual" DECIMAL(7,4),
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
  "excluido_em" TIMESTAMPTZ(3),
  CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

CREATE SEQUENCE IF NOT EXISTS "produtos_loja_id_seq";
CREATE TABLE "produtos_loja" (
  "id" INTEGER NOT NULL DEFAULT nextval('"produtos_loja_id_seq"'::regclass),
  "loja_id" INTEGER NOT NULL,
  "nome" VARCHAR(180) NOT NULL,
  "resumo_curto" VARCHAR(220),
  "descricao" TEXT,
  "marca" VARCHAR(120),
  "unidade_medida" VARCHAR(40),
  "preco_centavos" BIGINT NOT NULL,
  "preco_promocional_centavos" BIGINT,
  "imagem_url" TEXT,
  "sku" VARCHAR(80),
  "status" "StatusProdutoLoja" NOT NULL DEFAULT 'ATIVO',
  "destaque" BOOLEAN NOT NULL DEFAULT false,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "estoque_controlado" BOOLEAN NOT NULL DEFAULT false,
  "estoque_quantidade" INTEGER,
  "prazo_estimado_minutos" INTEGER,
  "aceita_entrega" BOOLEAN NOT NULL DEFAULT true,
  "aceita_retirada" BOOLEAN NOT NULL DEFAULT true,
  "detalhes_json" JSONB,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
  "excluido_em" TIMESTAMPTZ(3),
  CONSTRAINT "produtos_loja_pkey" PRIMARY KEY ("id")
);

INSERT INTO "lojistas" (
  "id",
  "usuario_id",
  "tipo_pessoa",
  "cpf",
  "cnpj",
  "razao_social",
  "nome_fantasia",
  "status_kyc",
  "status",
  "limite_faturamento_mensal_centavos",
  "criado_em",
  "atualizado_em",
  "excluido_em"
)
SELECT
  "id",
  "usuario_id",
  "tipo_pessoa",
  "cpf",
  "cnpj",
  "razao_social",
  "nome_fantasia",
  "status_kyc",
  "status",
  "limite_faturamento_mensal_centavos",
  "criado_em",
  "atualizado_em",
  "excluido_em"
FROM "_reordenar_old_lojistas";

INSERT INTO "categorias_loja" (
  "id",
  "nome",
  "descricao",
  "icone_url",
  "status",
  "criado_em",
  "atualizado_em",
  "excluido_em"
)
SELECT
  "id",
  "nome",
  "descricao",
  "icone_url",
  "status",
  "criado_em",
  "atualizado_em",
  "excluido_em"
FROM "_reordenar_old_categorias_loja";

INSERT INTO "lojas" (
  "id",
  "lojista_id",
  "nome",
  "slug",
  "descricao",
  "categoria_id",
  "telefone",
  "whatsapp",
  "email",
  "logo_url",
  "banner_url",
  "status",
  "visivel_no_app",
  "aceita_pagamento_online",
  "aceita_qrcode",
  "taxa_plataforma_padrao_percentual",
  "criado_em",
  "atualizado_em",
  "excluido_em"
)
SELECT
  "id",
  "lojista_id",
  "nome",
  "slug",
  "descricao",
  "categoria_id",
  "telefone",
  "whatsapp",
  "email",
  "logo_url",
  "banner_url",
  "status",
  "visivel_no_app",
  "aceita_pagamento_online",
  "aceita_qrcode",
  "taxa_plataforma_padrao_percentual",
  "criado_em",
  "atualizado_em",
  "excluido_em"
FROM "_reordenar_old_lojas";

INSERT INTO "produtos_loja" (
  "id",
  "loja_id",
  "nome",
  "resumo_curto",
  "descricao",
  "marca",
  "unidade_medida",
  "preco_centavos",
  "preco_promocional_centavos",
  "imagem_url",
  "sku",
  "status",
  "destaque",
  "ordem",
  "estoque_controlado",
  "estoque_quantidade",
  "prazo_estimado_minutos",
  "aceita_entrega",
  "aceita_retirada",
  "detalhes_json",
  "criado_em",
  "atualizado_em",
  "excluido_em"
)
SELECT
  "id",
  "loja_id",
  "nome",
  "resumo_curto",
  "descricao",
  "marca",
  "unidade_medida",
  "preco_centavos",
  "preco_promocional_centavos",
  "imagem_url",
  "sku",
  "status",
  "destaque",
  "ordem",
  "estoque_controlado",
  "estoque_quantidade",
  "prazo_estimado_minutos",
  "aceita_entrega",
  "aceita_retirada",
  "detalhes_json",
  "criado_em",
  "atualizado_em",
  "excluido_em"
FROM "_reordenar_old_produtos_loja";

DROP TABLE "_reordenar_old_produtos_loja";
DROP TABLE "_reordenar_old_lojas";
DROP TABLE "_reordenar_old_categorias_loja";
DROP TABLE "_reordenar_old_lojistas";

ALTER SEQUENCE "lojistas_id_seq" OWNED BY "lojistas"."id";
ALTER SEQUENCE "categorias_loja_id_seq" OWNED BY "categorias_loja"."id";
ALTER SEQUENCE "lojas_id_seq" OWNED BY "lojas"."id";
ALTER SEQUENCE "produtos_loja_id_seq" OWNED BY "produtos_loja"."id";

SELECT setval(
  '"lojistas_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "lojistas"), 1),
  (SELECT COUNT(*) > 0 FROM "lojistas")
);
SELECT setval(
  '"categorias_loja_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "categorias_loja"), 1),
  (SELECT COUNT(*) > 0 FROM "categorias_loja")
);
SELECT setval(
  '"lojas_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "lojas"), 1),
  (SELECT COUNT(*) > 0 FROM "lojas")
);
SELECT setval(
  '"produtos_loja_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "produtos_loja"), 1),
  (SELECT COUNT(*) > 0 FROM "produtos_loja")
);

CREATE UNIQUE INDEX "lojistas_usuario_id_key" ON "lojistas"("usuario_id");
CREATE INDEX "lojistas_cpf_idx" ON "lojistas"("cpf");
CREATE INDEX "lojistas_cnpj_idx" ON "lojistas"("cnpj");
CREATE INDEX "lojistas_status_idx" ON "lojistas"("status");
CREATE INDEX "lojistas_status_kyc_idx" ON "lojistas"("status_kyc");

CREATE INDEX "categorias_loja_nome_idx" ON "categorias_loja"("nome");
CREATE INDEX "categorias_loja_status_idx" ON "categorias_loja"("status");

CREATE UNIQUE INDEX "lojas_slug_key" ON "lojas"("slug");
CREATE INDEX "lojas_lojista_id_idx" ON "lojas"("lojista_id");
CREATE INDEX "lojas_categoria_id_idx" ON "lojas"("categoria_id");
CREATE INDEX "lojas_status_idx" ON "lojas"("status");
CREATE INDEX "lojas_visivel_no_app_idx" ON "lojas"("visivel_no_app");

CREATE INDEX "produtos_loja_loja_id_idx" ON "produtos_loja"("loja_id");
CREATE INDEX "produtos_loja_status_idx" ON "produtos_loja"("status");
CREATE INDEX "produtos_loja_destaque_idx" ON "produtos_loja"("destaque");
CREATE INDEX "produtos_loja_ordem_idx" ON "produtos_loja"("ordem");

ALTER TABLE "lojistas" ADD CONSTRAINT "lojistas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_lojista_id_fkey" FOREIGN KEY ("lojista_id") REFERENCES "lojistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "produtos_loja" ADD CONSTRAINT "produtos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enderecos_loja" ADD CONSTRAINT "enderecos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usuarios_loja" ADD CONSTRAINT "usuarios_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos_loja" ADD CONSTRAINT "pedidos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "itens_pedido_loja" ADD CONSTRAINT "itens_pedido_loja_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos_loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_lojista_id_fkey" FOREIGN KEY ("lojista_id") REFERENCES "lojistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recebiveis" ADD CONSTRAINT "recebiveis_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campanhas_cashback" ADD CONSTRAINT "campanhas_cashback_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "taxas_plataforma" ADD CONSTRAINT "taxas_plataforma_categoria_loja_id_fkey" FOREIGN KEY ("categoria_loja_id") REFERENCES "categorias_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "taxas_plataforma" ADD CONSTRAINT "taxas_plataforma_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
