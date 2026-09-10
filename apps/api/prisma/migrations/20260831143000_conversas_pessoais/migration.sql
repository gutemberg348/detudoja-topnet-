CREATE TYPE "StatusConversaPessoal" AS ENUM ('PENDENTE', 'ATIVA', 'RECUSADA', 'BLOQUEADA');

ALTER TABLE "usuarios" ADD COLUMN "identificador_publico" VARCHAR(80);

UPDATE "usuarios"
SET "identificador_publico" = CONCAT(
  COALESCE(
    NULLIF(
      TRIM(BOTH '.' FROM REGEXP_REPLACE(LOWER("nome"), '[^a-z0-9]+', '.', 'g')),
      ''
    ),
    'usuario'
  ),
  '.',
  TO_HEX("id")
)
WHERE "identificador_publico" IS NULL;

CREATE UNIQUE INDEX "usuarios_identificador_publico_key"
ON "usuarios"("identificador_publico");

CREATE INDEX "usuarios_identificador_publico_idx"
ON "usuarios"("identificador_publico");

CREATE TABLE "conversas_pessoais" (
  "id" SERIAL NOT NULL,
  "usuario_a_id" INTEGER NOT NULL,
  "usuario_b_id" INTEGER NOT NULL,
  "solicitado_por_id" INTEGER NOT NULL,
  "status" "StatusConversaPessoal" NOT NULL DEFAULT 'PENDENTE',
  "apelido_usuario_a" VARCHAR(80),
  "apelido_usuario_b" VARCHAR(80),
  "nao_lidas_usuario_a" INTEGER NOT NULL DEFAULT 0,
  "nao_lidas_usuario_b" INTEGER NOT NULL DEFAULT 0,
  "ultima_mensagem_em" TIMESTAMPTZ(3),
  "aceito_em" TIMESTAMPTZ(3),
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "conversas_pessoais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversas_pessoais_par_ordenado_check"
    CHECK ("usuario_a_id" < "usuario_b_id"),
  CONSTRAINT "conversas_pessoais_solicitante_participante_check"
    CHECK (
      "solicitado_por_id" = "usuario_a_id"
      OR "solicitado_por_id" = "usuario_b_id"
    ),
  CONSTRAINT "conversas_pessoais_nao_lidas_a_check"
    CHECK ("nao_lidas_usuario_a" >= 0),
  CONSTRAINT "conversas_pessoais_nao_lidas_b_check"
    CHECK ("nao_lidas_usuario_b" >= 0)
);

CREATE TABLE "conversas_pessoais_mensagens" (
  "id" SERIAL NOT NULL,
  "conversa_id" INTEGER NOT NULL,
  "autor_usuario_id" INTEGER NOT NULL,
  "mensagem" VARCHAR(2000) NOT NULL,
  "lido_em" TIMESTAMPTZ(3),
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversas_pessoais_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversas_pessoais_usuario_a_id_usuario_b_id_key"
ON "conversas_pessoais"("usuario_a_id", "usuario_b_id");

CREATE INDEX "conversas_pessoais_usuario_a_id_status_ultima_mensagem_em_idx"
ON "conversas_pessoais"("usuario_a_id", "status", "ultima_mensagem_em");

CREATE INDEX "conversas_pessoais_usuario_b_id_status_ultima_mensagem_em_idx"
ON "conversas_pessoais"("usuario_b_id", "status", "ultima_mensagem_em");

CREATE INDEX "conversas_pessoais_solicitado_por_id_status_idx"
ON "conversas_pessoais"("solicitado_por_id", "status");

CREATE INDEX "conversas_pessoais_mensagens_conversa_id_criado_em_idx"
ON "conversas_pessoais_mensagens"("conversa_id", "criado_em");

CREATE INDEX "conversas_pessoais_mensagens_autor_usuario_id_idx"
ON "conversas_pessoais_mensagens"("autor_usuario_id");

CREATE INDEX "conversas_pessoais_mensagens_conversa_id_lido_em_idx"
ON "conversas_pessoais_mensagens"("conversa_id", "lido_em");

ALTER TABLE "conversas_pessoais"
ADD CONSTRAINT "conversas_pessoais_usuario_a_id_fkey"
FOREIGN KEY ("usuario_a_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversas_pessoais"
ADD CONSTRAINT "conversas_pessoais_usuario_b_id_fkey"
FOREIGN KEY ("usuario_b_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversas_pessoais"
ADD CONSTRAINT "conversas_pessoais_solicitado_por_id_fkey"
FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversas_pessoais_mensagens"
ADD CONSTRAINT "conversas_pessoais_mensagens_conversa_id_fkey"
FOREIGN KEY ("conversa_id") REFERENCES "conversas_pessoais"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversas_pessoais_mensagens"
ADD CONSTRAINT "conversas_pessoais_mensagens_autor_usuario_id_fkey"
FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
