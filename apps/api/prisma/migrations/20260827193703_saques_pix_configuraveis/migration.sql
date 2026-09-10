/*
  Warnings:

  - A unique constraint covering the columns `[saque_id]` on the table `lancamentos_plataforma` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[referencia_externa]` on the table `saques` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gateway_saque_id]` on the table `saques` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[usuario_id,chave_idempotencia]` on the table `saques` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "StatusSaque" ADD VALUE 'EM_RECONCILIACAO';

-- AlterTable
ALTER TABLE "lancamentos_plataforma" ADD COLUMN     "saque_id" INTEGER;

-- AlterTable
ALTER TABLE "saques" ADD COLUMN     "aprovado_em" TIMESTAMPTZ(3),
ADD COLUMN     "aprovado_por_admin_id" INTEGER,
ADD COLUMN     "chave_idempotencia" VARCHAR(100),
ADD COLUMN     "chave_pix_destino" VARCHAR(255),
ADD COLUMN     "comprovante_url" TEXT,
ADD COLUMN     "documento_titular" VARCHAR(18),
ADD COLUMN     "enviado_em" TIMESTAMPTZ(3),
ADD COLUMN     "falhou_em" TIMESTAMPTZ(3),
ADD COLUMN     "gateway" "GatewayPagamento" NOT NULL DEFAULT 'ASAAS',
ADD COLUMN     "motivo_falha" TEXT,
ADD COLUMN     "nome_titular" VARCHAR(180),
ADD COLUMN     "recusado_por_admin_id" INTEGER,
ADD COLUMN     "referencia_externa" VARCHAR(120),
ADD COLUMN     "tentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_chave_pix" "TipoChavePix";

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_plataforma_saque_id_key" ON "lancamentos_plataforma"("saque_id");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_saque_id_idx" ON "lancamentos_plataforma"("saque_id");

-- CreateIndex
CREATE UNIQUE INDEX "saques_referencia_externa_key" ON "saques"("referencia_externa");

-- CreateIndex
CREATE UNIQUE INDEX "saques_gateway_saque_id_key" ON "saques"("gateway_saque_id");

-- CreateIndex
CREATE INDEX "saques_aprovado_por_admin_id_idx" ON "saques"("aprovado_por_admin_id");

-- CreateIndex
CREATE INDEX "saques_recusado_por_admin_id_idx" ON "saques"("recusado_por_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "saques_usuario_id_chave_idempotencia_key" ON "saques"("usuario_id", "chave_idempotencia");

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_aprovado_por_admin_id_fkey" FOREIGN KEY ("aprovado_por_admin_id") REFERENCES "administradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_recusado_por_admin_id_fkey" FOREIGN KEY ("recusado_por_admin_id") REFERENCES "administradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_plataforma" ADD CONSTRAINT "lancamentos_plataforma_saque_id_fkey" FOREIGN KEY ("saque_id") REFERENCES "saques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
