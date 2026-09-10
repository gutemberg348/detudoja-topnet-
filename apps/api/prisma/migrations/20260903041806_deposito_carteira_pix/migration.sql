-- CreateEnum
CREATE TYPE "StatusDepositoCarteira" AS ENUM ('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'FALHOU', 'EM_REVISAO');

-- AlterEnum
ALTER TYPE "OrigemLancamentoCarteira" ADD VALUE 'DEPOSITO_PIX';

-- CreateTable
CREATE TABLE "depositos_carteira" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "carteira_id" INTEGER NOT NULL,
    "pagamento_id" INTEGER NOT NULL,
    "chave_idempotencia" VARCHAR(100) NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "status" "StatusDepositoCarteira" NOT NULL DEFAULT 'PENDENTE',
    "creditado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "depositos_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saques_origens_carteira" (
    "id" SERIAL NOT NULL,
    "saque_id" INTEGER NOT NULL,
    "carteira_id" INTEGER NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saques_origens_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "depositos_carteira_pagamento_id_key" ON "depositos_carteira"("pagamento_id");

-- CreateIndex
CREATE INDEX "depositos_carteira_usuario_id_status_criado_em_idx" ON "depositos_carteira"("usuario_id", "status", "criado_em");

-- CreateIndex
CREATE INDEX "depositos_carteira_carteira_id_idx" ON "depositos_carteira"("carteira_id");

-- CreateIndex
CREATE UNIQUE INDEX "depositos_carteira_usuario_id_chave_idempotencia_key" ON "depositos_carteira"("usuario_id", "chave_idempotencia");

-- CreateIndex
CREATE INDEX "saques_origens_carteira_carteira_id_idx" ON "saques_origens_carteira"("carteira_id");

-- CreateIndex
CREATE UNIQUE INDEX "saques_origens_carteira_saque_id_carteira_id_key" ON "saques_origens_carteira"("saque_id", "carteira_id");

-- AddForeignKey
ALTER TABLE "depositos_carteira" ADD CONSTRAINT "depositos_carteira_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos_carteira" ADD CONSTRAINT "depositos_carteira_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos_carteira" ADD CONSTRAINT "depositos_carteira_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques_origens_carteira" ADD CONSTRAINT "saques_origens_carteira_saque_id_fkey" FOREIGN KEY ("saque_id") REFERENCES "saques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques_origens_carteira" ADD CONSTRAINT "saques_origens_carteira_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
