ALTER TABLE "usuarios"
  ADD COLUMN "cidade_busca" VARCHAR(120),
  ADD COLUMN "estado_busca" CHAR(2);

ALTER TABLE "enderecos_usuario"
  ADD COLUMN "cidade_normalizada" VARCHAR(120);

ALTER TABLE "enderecos_loja"
  ADD COLUMN "cidade_normalizada" VARCHAR(120);

UPDATE "enderecos_usuario"
SET "cidade_normalizada" = trim(regexp_replace(
  translate(lower("cidade"),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'),
  '\s+', ' ', 'g'));

UPDATE "enderecos_loja"
SET "cidade_normalizada" = trim(regexp_replace(
  translate(lower("cidade"),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'),
  '\s+', ' ', 'g'));

UPDATE "usuarios" AS usuario
SET
  "cidade_busca" = (
    SELECT endereco."cidade"
    FROM "enderecos_usuario" AS endereco
    WHERE endereco."usuario_id" = usuario."id" AND endereco."excluido_em" IS NULL
    ORDER BY endereco."principal" DESC, endereco."criado_em" ASC
    LIMIT 1
  ),
  "estado_busca" = (
    SELECT endereco."estado"
    FROM "enderecos_usuario" AS endereco
    WHERE endereco."usuario_id" = usuario."id" AND endereco."excluido_em" IS NULL
    ORDER BY endereco."principal" DESC, endereco."criado_em" ASC
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM "enderecos_usuario" AS endereco
  WHERE endereco."usuario_id" = usuario."id" AND endereco."excluido_em" IS NULL
);

CREATE INDEX "usuarios_estado_busca_cidade_busca_idx"
  ON "usuarios"("estado_busca", "cidade_busca");

CREATE INDEX "enderecos_usuario_estado_cidade_normalizada_idx"
  ON "enderecos_usuario"("estado", "cidade_normalizada");

CREATE INDEX "enderecos_loja_estado_cidade_normalizada_idx"
  ON "enderecos_loja"("estado", "cidade_normalizada");
