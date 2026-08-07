BEGIN;

CREATE TEMP TABLE "_ids_int_lojistas" ON COMMIT DROP AS
SELECT
  "id" AS "old_id",
  row_number() OVER (ORDER BY "criado_em", "id")::integer AS "new_id"
FROM "lojistas";

CREATE TEMP TABLE "_ids_int_categorias_loja" ON COMMIT DROP AS
SELECT
  "id" AS "old_id",
  row_number() OVER (ORDER BY "criado_em", "id")::integer AS "new_id"
FROM "categorias_loja";

CREATE TEMP TABLE "_ids_int_lojas" ON COMMIT DROP AS
SELECT
  "id" AS "old_id",
  row_number() OVER (ORDER BY "criado_em", "id")::integer AS "new_id"
FROM "lojas";

CREATE TEMP TABLE "_ids_int_produtos_loja" ON COMMIT DROP AS
SELECT
  "id" AS "old_id",
  row_number() OVER (ORDER BY "criado_em", "id")::integer AS "new_id"
FROM "produtos_loja";

ALTER TABLE "lojistas" ADD COLUMN "id_new" INTEGER;
UPDATE "lojistas" AS "target"
SET "id_new" = "map"."new_id"
FROM "_ids_int_lojistas" AS "map"
WHERE "target"."id" = "map"."old_id";
ALTER TABLE "lojistas" ALTER COLUMN "id_new" SET NOT NULL;

ALTER TABLE "categorias_loja" ADD COLUMN "id_new" INTEGER;
UPDATE "categorias_loja" AS "target"
SET "id_new" = "map"."new_id"
FROM "_ids_int_categorias_loja" AS "map"
WHERE "target"."id" = "map"."old_id";
ALTER TABLE "categorias_loja" ALTER COLUMN "id_new" SET NOT NULL;

ALTER TABLE "lojas"
  ADD COLUMN "id_new" INTEGER,
  ADD COLUMN "lojista_id_new" INTEGER,
  ADD COLUMN "categoria_id_new" INTEGER;
UPDATE "lojas" AS "target"
SET
  "id_new" = "loja_map"."new_id",
  "lojista_id_new" = "lojista_map"."new_id",
  "categoria_id_new" = "categoria_map"."new_id"
FROM "_ids_int_lojas" AS "loja_map"
JOIN "_ids_int_lojistas" AS "lojista_map"
  ON true
JOIN "_ids_int_categorias_loja" AS "categoria_map"
  ON true
WHERE "target"."id" = "loja_map"."old_id"
  AND "target"."lojista_id" = "lojista_map"."old_id"
  AND "target"."categoria_id" = "categoria_map"."old_id";
ALTER TABLE "lojas" ALTER COLUMN "id_new" SET NOT NULL;
ALTER TABLE "lojas" ALTER COLUMN "lojista_id_new" SET NOT NULL;
ALTER TABLE "lojas" ALTER COLUMN "categoria_id_new" SET NOT NULL;

ALTER TABLE "produtos_loja"
  ADD COLUMN "id_new" INTEGER,
  ADD COLUMN "loja_id_new" INTEGER;
UPDATE "produtos_loja" AS "target"
SET
  "id_new" = "produto_map"."new_id",
  "loja_id_new" = "loja_map"."new_id"
FROM "_ids_int_produtos_loja" AS "produto_map"
JOIN "_ids_int_lojas" AS "loja_map"
  ON true
WHERE "target"."id" = "produto_map"."old_id"
  AND "target"."loja_id" = "loja_map"."old_id";
ALTER TABLE "produtos_loja" ALTER COLUMN "id_new" SET NOT NULL;
ALTER TABLE "produtos_loja" ALTER COLUMN "loja_id_new" SET NOT NULL;

ALTER TABLE "enderecos_loja" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "enderecos_loja" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";
ALTER TABLE "enderecos_loja" ALTER COLUMN "loja_id_new" SET NOT NULL;

ALTER TABLE "usuarios_loja" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "usuarios_loja" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";
ALTER TABLE "usuarios_loja" ALTER COLUMN "loja_id_new" SET NOT NULL;

ALTER TABLE "pagamentos" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "pagamentos" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";

ALTER TABLE "pedidos_loja" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "pedidos_loja" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";
ALTER TABLE "pedidos_loja" ALTER COLUMN "loja_id_new" SET NOT NULL;

ALTER TABLE "itens_pedido_loja" ADD COLUMN "produto_id_new" INTEGER;
UPDATE "itens_pedido_loja" AS "target"
SET "produto_id_new" = "map"."new_id"
FROM "_ids_int_produtos_loja" AS "map"
WHERE "target"."produto_id" = "map"."old_id";

ALTER TABLE "transacoes_comerciais"
  ADD COLUMN "loja_id_new" INTEGER,
  ADD COLUMN "lojista_id_new" INTEGER;
UPDATE "transacoes_comerciais" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";
UPDATE "transacoes_comerciais" AS "target"
SET "lojista_id_new" = "map"."new_id"
FROM "_ids_int_lojistas" AS "map"
WHERE "target"."lojista_id" = "map"."old_id";

ALTER TABLE "recebiveis" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "recebiveis" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";

ALTER TABLE "campanhas_cashback" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "campanhas_cashback" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";

ALTER TABLE "taxas_plataforma"
  ADD COLUMN "categoria_loja_id_new" INTEGER,
  ADD COLUMN "loja_id_new" INTEGER;
UPDATE "taxas_plataforma" AS "target"
SET "categoria_loja_id_new" = "map"."new_id"
FROM "_ids_int_categorias_loja" AS "map"
WHERE "target"."categoria_loja_id" = "map"."old_id";
UPDATE "taxas_plataforma" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";

ALTER TABLE "documentos_fiscais" ADD COLUMN "loja_id_new" INTEGER;
UPDATE "documentos_fiscais" AS "target"
SET "loja_id_new" = "map"."new_id"
FROM "_ids_int_lojas" AS "map"
WHERE "target"."loja_id" = "map"."old_id";
ALTER TABLE "documentos_fiscais" ALTER COLUMN "loja_id_new" SET NOT NULL;

ALTER TABLE "itens_pagamento"
  ALTER COLUMN "referencia_id" TYPE VARCHAR(80)
  USING "referencia_id"::text;

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
      AND "confrelid" IN (
        '"lojistas"'::regclass,
        '"categorias_loja"'::regclass,
        '"lojas"'::regclass,
        '"produtos_loja"'::regclass
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      "constraint_record"."table_name",
      "constraint_record"."constraint_name"
    );
  END LOOP;
END $$;

ALTER TABLE "lojistas" DROP CONSTRAINT IF EXISTS "lojistas_pkey";
ALTER TABLE "categorias_loja" DROP CONSTRAINT IF EXISTS "categorias_loja_pkey";
ALTER TABLE "lojas" DROP CONSTRAINT IF EXISTS "lojas_pkey";
ALTER TABLE "produtos_loja" DROP CONSTRAINT IF EXISTS "produtos_loja_pkey";

ALTER TABLE "lojistas" DROP COLUMN "id";
ALTER TABLE "lojistas" RENAME COLUMN "id_new" TO "id";

ALTER TABLE "categorias_loja" DROP COLUMN "id";
ALTER TABLE "categorias_loja" RENAME COLUMN "id_new" TO "id";

ALTER TABLE "lojas"
  DROP COLUMN "id",
  DROP COLUMN "lojista_id",
  DROP COLUMN "categoria_id";
ALTER TABLE "lojas" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "lojas" RENAME COLUMN "lojista_id_new" TO "lojista_id";
ALTER TABLE "lojas" RENAME COLUMN "categoria_id_new" TO "categoria_id";

ALTER TABLE "produtos_loja"
  DROP COLUMN "id",
  DROP COLUMN "loja_id";
ALTER TABLE "produtos_loja" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "produtos_loja" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "enderecos_loja" DROP COLUMN "loja_id";
ALTER TABLE "enderecos_loja" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "usuarios_loja" DROP COLUMN "loja_id";
ALTER TABLE "usuarios_loja" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "pagamentos" DROP COLUMN "loja_id";
ALTER TABLE "pagamentos" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "pedidos_loja" DROP COLUMN "loja_id";
ALTER TABLE "pedidos_loja" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "itens_pedido_loja" DROP COLUMN "produto_id";
ALTER TABLE "itens_pedido_loja" RENAME COLUMN "produto_id_new" TO "produto_id";

ALTER TABLE "transacoes_comerciais"
  DROP COLUMN "loja_id",
  DROP COLUMN "lojista_id";
ALTER TABLE "transacoes_comerciais" RENAME COLUMN "loja_id_new" TO "loja_id";
ALTER TABLE "transacoes_comerciais" RENAME COLUMN "lojista_id_new" TO "lojista_id";

ALTER TABLE "recebiveis" DROP COLUMN "loja_id";
ALTER TABLE "recebiveis" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "campanhas_cashback" DROP COLUMN "loja_id";
ALTER TABLE "campanhas_cashback" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "taxas_plataforma"
  DROP COLUMN "categoria_loja_id",
  DROP COLUMN "loja_id";
ALTER TABLE "taxas_plataforma" RENAME COLUMN "categoria_loja_id_new" TO "categoria_loja_id";
ALTER TABLE "taxas_plataforma" RENAME COLUMN "loja_id_new" TO "loja_id";

ALTER TABLE "documentos_fiscais" DROP COLUMN "loja_id";
ALTER TABLE "documentos_fiscais" RENAME COLUMN "loja_id_new" TO "loja_id";

CREATE SEQUENCE IF NOT EXISTS "lojistas_id_seq";
ALTER SEQUENCE "lojistas_id_seq" OWNED BY "lojistas"."id";
ALTER TABLE "lojistas" ALTER COLUMN "id" SET DEFAULT nextval('"lojistas_id_seq"'::regclass);
SELECT setval(
  '"lojistas_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "lojistas"), 1),
  (SELECT COUNT(*) > 0 FROM "lojistas")
);

CREATE SEQUENCE IF NOT EXISTS "categorias_loja_id_seq";
ALTER SEQUENCE "categorias_loja_id_seq" OWNED BY "categorias_loja"."id";
ALTER TABLE "categorias_loja" ALTER COLUMN "id" SET DEFAULT nextval('"categorias_loja_id_seq"'::regclass);
SELECT setval(
  '"categorias_loja_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "categorias_loja"), 1),
  (SELECT COUNT(*) > 0 FROM "categorias_loja")
);

CREATE SEQUENCE IF NOT EXISTS "lojas_id_seq";
ALTER SEQUENCE "lojas_id_seq" OWNED BY "lojas"."id";
ALTER TABLE "lojas" ALTER COLUMN "id" SET DEFAULT nextval('"lojas_id_seq"'::regclass);
SELECT setval(
  '"lojas_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "lojas"), 1),
  (SELECT COUNT(*) > 0 FROM "lojas")
);

CREATE SEQUENCE IF NOT EXISTS "produtos_loja_id_seq";
ALTER SEQUENCE "produtos_loja_id_seq" OWNED BY "produtos_loja"."id";
ALTER TABLE "produtos_loja" ALTER COLUMN "id" SET DEFAULT nextval('"produtos_loja_id_seq"'::regclass);
SELECT setval(
  '"produtos_loja_id_seq"'::regclass,
  COALESCE((SELECT MAX("id") FROM "produtos_loja"), 1),
  (SELECT COUNT(*) > 0 FROM "produtos_loja")
);

ALTER TABLE "lojistas" ADD CONSTRAINT "lojistas_pkey" PRIMARY KEY ("id");
ALTER TABLE "categorias_loja" ADD CONSTRAINT "categorias_loja_pkey" PRIMARY KEY ("id");
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_pkey" PRIMARY KEY ("id");
ALTER TABLE "produtos_loja" ADD CONSTRAINT "produtos_loja_pkey" PRIMARY KEY ("id");

CREATE INDEX IF NOT EXISTS "lojas_lojista_id_idx" ON "lojas"("lojista_id");
CREATE INDEX IF NOT EXISTS "lojas_categoria_id_idx" ON "lojas"("categoria_id");
CREATE INDEX IF NOT EXISTS "lojas_status_idx" ON "lojas"("status");
CREATE INDEX IF NOT EXISTS "lojas_visivel_no_app_idx" ON "lojas"("visivel_no_app");

CREATE UNIQUE INDEX IF NOT EXISTS "enderecos_loja_loja_id_key" ON "enderecos_loja"("loja_id");
CREATE INDEX IF NOT EXISTS "enderecos_loja_loja_id_idx" ON "enderecos_loja"("loja_id");

CREATE INDEX IF NOT EXISTS "usuarios_loja_loja_id_idx" ON "usuarios_loja"("loja_id");
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_loja_loja_id_usuario_id_key" ON "usuarios_loja"("loja_id", "usuario_id");

CREATE INDEX IF NOT EXISTS "produtos_loja_loja_id_idx" ON "produtos_loja"("loja_id");
CREATE INDEX IF NOT EXISTS "produtos_loja_status_idx" ON "produtos_loja"("status");
CREATE INDEX IF NOT EXISTS "produtos_loja_destaque_idx" ON "produtos_loja"("destaque");
CREATE INDEX IF NOT EXISTS "produtos_loja_ordem_idx" ON "produtos_loja"("ordem");

CREATE INDEX IF NOT EXISTS "pagamentos_loja_id_idx" ON "pagamentos"("loja_id");
CREATE INDEX IF NOT EXISTS "pedidos_loja_loja_id_idx" ON "pedidos_loja"("loja_id");
CREATE INDEX IF NOT EXISTS "itens_pedido_loja_produto_id_idx" ON "itens_pedido_loja"("produto_id");
CREATE INDEX IF NOT EXISTS "transacoes_comerciais_loja_id_idx" ON "transacoes_comerciais"("loja_id");
CREATE INDEX IF NOT EXISTS "transacoes_comerciais_lojista_id_idx" ON "transacoes_comerciais"("lojista_id");
CREATE INDEX IF NOT EXISTS "recebiveis_loja_id_idx" ON "recebiveis"("loja_id");
CREATE INDEX IF NOT EXISTS "campanhas_cashback_loja_id_idx" ON "campanhas_cashback"("loja_id");
CREATE INDEX IF NOT EXISTS "taxas_plataforma_categoria_loja_id_idx" ON "taxas_plataforma"("categoria_loja_id");
CREATE INDEX IF NOT EXISTS "taxas_plataforma_loja_id_idx" ON "taxas_plataforma"("loja_id");
CREATE INDEX IF NOT EXISTS "documentos_fiscais_loja_id_idx" ON "documentos_fiscais"("loja_id");

ALTER TABLE "lojas" ADD CONSTRAINT "lojas_lojista_id_fkey" FOREIGN KEY ("lojista_id") REFERENCES "lojistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enderecos_loja" ADD CONSTRAINT "enderecos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usuarios_loja" ADD CONSTRAINT "usuarios_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "produtos_loja" ADD CONSTRAINT "produtos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
