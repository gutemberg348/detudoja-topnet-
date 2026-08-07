/*
  Warnings:

  - A unique constraint covering the columns `[vendedor_id,tipo_servico_id]` on the table `servicos_vendedor` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ModoAtendimentoServico" AS ENUM ('NEGOCIACAO_CHAT', 'PRECO_FIXO');

-- AlterTable
ALTER TABLE "conversas_servico" ADD COLUMN     "servico_vendedor_id" INTEGER;

-- AlterTable
ALTER TABLE "servicos_vendedor" ADD COLUMN     "disponivel_agora" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tipo_servico_id" INTEGER,
ALTER COLUMN "preco_centavos" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tipos_servico" (
    "id" SERIAL NOT NULL,
    "segmento_venda_id" INTEGER,
    "nome" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "descricao" TEXT,
    "icone" VARCHAR(80),
    "modo_atendimento" "ModoAtendimentoServico" NOT NULL DEFAULT 'NEGOCIACAO_CHAT',
    "status" "StatusServicoVendedor" NOT NULL DEFAULT 'ATIVO',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "tipos_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_servico_nome_key" ON "tipos_servico"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_servico_slug_key" ON "tipos_servico"("slug");

-- CreateIndex
CREATE INDEX "tipos_servico_segmento_venda_id_idx" ON "tipos_servico"("segmento_venda_id");

-- CreateIndex
CREATE INDEX "tipos_servico_status_idx" ON "tipos_servico"("status");

-- CreateIndex
CREATE INDEX "tipos_servico_ordem_idx" ON "tipos_servico"("ordem");

-- CreateIndex
CREATE INDEX "conversas_servico_servico_vendedor_id_idx" ON "conversas_servico"("servico_vendedor_id");

-- CreateIndex
CREATE INDEX "servicos_vendedor_tipo_servico_id_idx" ON "servicos_vendedor"("tipo_servico_id");

-- CreateIndex
CREATE INDEX "servicos_vendedor_disponivel_agora_idx" ON "servicos_vendedor"("disponivel_agora");

-- CreateIndex
CREATE UNIQUE INDEX "servicos_vendedor_vendedor_id_tipo_servico_id_key" ON "servicos_vendedor"("vendedor_id", "tipo_servico_id");

-- AddForeignKey
ALTER TABLE "servicos_vendedor" ADD CONSTRAINT "servicos_vendedor_tipo_servico_id_fkey" FOREIGN KEY ("tipo_servico_id") REFERENCES "tipos_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_servico" ADD CONSTRAINT "tipos_servico_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_servico_vendedor_id_fkey" FOREIGN KEY ("servico_vendedor_id") REFERENCES "servicos_vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
