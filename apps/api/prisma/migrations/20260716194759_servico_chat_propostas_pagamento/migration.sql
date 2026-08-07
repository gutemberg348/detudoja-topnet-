/*
  Warnings:

  - A unique constraint covering the columns `[proposta_servico_id]` on the table `cobrancas` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StatusPropostaServico" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA', 'PAGA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "FormaPagamentoServico" AS ENUM ('ONLINE', 'QR_PRESENCIAL');

-- AlterEnum
ALTER TYPE "StatusConversaServico" ADD VALUE 'AGUARDANDO_CONFIRMACAO';

-- AlterTable
ALTER TABLE "cobrancas" ADD COLUMN     "proposta_servico_id" INTEGER;

-- AlterTable
ALTER TABLE "conversas_servico" ADD COLUMN     "visualizado_vendedor_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "propostas_servico" (
    "id" SERIAL NOT NULL,
    "conversa_servico_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "descricao" TEXT,
    "forma_pagamento" "FormaPagamentoServico" NOT NULL,
    "status" "StatusPropostaServico" NOT NULL DEFAULT 'PENDENTE',
    "respondido_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "concluido_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "propostas_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propostas_servico_conversa_servico_id_status_idx" ON "propostas_servico"("conversa_servico_id", "status");

-- CreateIndex
CREATE INDEX "propostas_servico_vendedor_id_idx" ON "propostas_servico"("vendedor_id");

-- CreateIndex
CREATE INDEX "propostas_servico_status_idx" ON "propostas_servico"("status");

-- CreateIndex
CREATE INDEX "propostas_servico_criado_em_idx" ON "propostas_servico"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_proposta_servico_id_key" ON "cobrancas"("proposta_servico_id");

-- CreateIndex
CREATE INDEX "cobrancas_proposta_servico_id_idx" ON "cobrancas"("proposta_servico_id");

-- AddForeignKey
ALTER TABLE "propostas_servico" ADD CONSTRAINT "propostas_servico_conversa_servico_id_fkey" FOREIGN KEY ("conversa_servico_id") REFERENCES "conversas_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_servico" ADD CONSTRAINT "propostas_servico_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_proposta_servico_id_fkey" FOREIGN KEY ("proposta_servico_id") REFERENCES "propostas_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
