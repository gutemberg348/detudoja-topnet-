/*
  Warnings:

  - A unique constraint covering the columns `[chave_pix]` on the table `contas_bancarias` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StatusRepassePix" AS ENUM ('PENDENTE', 'PROCESSANDO', 'EM_RECONCILIACAO', 'PAGO', 'FALHOU', 'CANCELADO');

-- DropIndex
DROP INDEX "contas_bancarias_chave_pix_idx";

-- CreateTable
CREATE TABLE "repasses_pix" (
    "id" SERIAL NOT NULL,
    "transacao_comercial_id" INTEGER NOT NULL,
    "recebivel_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "conta_bancaria_id" INTEGER NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "tipo_chave" "TipoChavePix" NOT NULL,
    "chave_pix_destino" VARCHAR(255) NOT NULL,
    "nome_titular" VARCHAR(180) NOT NULL,
    "documento_titular" VARCHAR(18) NOT NULL,
    "status" "StatusRepassePix" NOT NULL DEFAULT 'PENDENTE',
    "gateway" "GatewayPagamento" NOT NULL DEFAULT 'ASAAS',
    "gateway_transferencia_id" VARCHAR(255),
    "referencia_externa" VARCHAR(120) NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "motivo_falha" TEXT,
    "comprovante_url" TEXT,
    "solicitado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "falhou_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "repasses_pix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repasses_pix_transacao_comercial_id_key" ON "repasses_pix"("transacao_comercial_id");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_pix_recebivel_id_key" ON "repasses_pix"("recebivel_id");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_pix_gateway_transferencia_id_key" ON "repasses_pix"("gateway_transferencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_pix_referencia_externa_key" ON "repasses_pix"("referencia_externa");

-- CreateIndex
CREATE INDEX "repasses_pix_usuario_id_idx" ON "repasses_pix"("usuario_id");

-- CreateIndex
CREATE INDEX "repasses_pix_conta_bancaria_id_idx" ON "repasses_pix"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "repasses_pix_status_solicitado_em_idx" ON "repasses_pix"("status", "solicitado_em");

-- CreateIndex
CREATE INDEX "repasses_pix_gateway_idx" ON "repasses_pix"("gateway");

-- CreateIndex
CREATE UNIQUE INDEX "contas_bancarias_chave_pix_key" ON "contas_bancarias"("chave_pix");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_status_validada_em_idx" ON "transacoes_comerciais"("status", "validada_em");

-- AddForeignKey
ALTER TABLE "repasses_pix" ADD CONSTRAINT "repasses_pix_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_pix" ADD CONSTRAINT "repasses_pix_recebivel_id_fkey" FOREIGN KEY ("recebivel_id") REFERENCES "recebiveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_pix" ADD CONSTRAINT "repasses_pix_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_pix" ADD CONSTRAINT "repasses_pix_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
