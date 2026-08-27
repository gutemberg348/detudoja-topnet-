/*
  Warnings:

  - A unique constraint covering the columns `[usuario_id,chave_idempotencia]` on the table `pedidos_loja` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "pedidos_loja" ADD COLUMN     "chave_idempotencia" VARCHAR(120),
ADD COLUMN     "estoque_liberado_em" TIMESTAMPTZ(3),
ADD COLUMN     "estoque_reservado_em" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "solicitacoes_motoboy" ALTER COLUMN "loja_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "limite_faturamento_mensal_centavos" BIGINT;

-- CreateTable
CREATE TABLE "sessoes_autenticacao" (
    "id" SERIAL NOT NULL,
    "jti" VARCHAR(100) NOT NULL,
    "usuario_id" INTEGER,
    "administrador_id" INTEGER,
    "audiencia" VARCHAR(40) NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogada_em" TIMESTAMPTZ(3),
    "rotacionada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessoes_autenticacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_autenticacao_jti_key" ON "sessoes_autenticacao"("jti");

-- CreateIndex
CREATE INDEX "sessoes_autenticacao_usuario_id_audiencia_idx" ON "sessoes_autenticacao"("usuario_id", "audiencia");

-- CreateIndex
CREATE INDEX "sessoes_autenticacao_administrador_id_audiencia_idx" ON "sessoes_autenticacao"("administrador_id", "audiencia");

-- CreateIndex
CREATE INDEX "sessoes_autenticacao_expira_em_idx" ON "sessoes_autenticacao"("expira_em");

-- CreateIndex
CREATE INDEX "sessoes_autenticacao_revogada_em_idx" ON "sessoes_autenticacao"("revogada_em");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_loja_usuario_id_chave_idempotencia_key" ON "pedidos_loja"("usuario_id", "chave_idempotencia");

-- AddForeignKey
ALTER TABLE "sessoes_autenticacao" ADD CONSTRAINT "sessoes_autenticacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_autenticacao" ADD CONSTRAINT "sessoes_autenticacao_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "administradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
