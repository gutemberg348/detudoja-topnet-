/*
  Warnings:

  - A unique constraint covering the columns `[tipo_conta]` on the table `contas_plataforma` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transacao_comercial_id,usuario_recebedor_id,tipo_recebedor]` on the table `recebiveis` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transacao_comercial_id,usuario_beneficiado_id,tipo_recompensa]` on the table `recompensas` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "OrigemLancamentoCarteira" ADD VALUE 'BONUS_REDE';

-- AlterEnum
ALTER TYPE "TipoRecompensa" ADD VALUE 'BONUS_REDE';

-- CreateIndex
CREATE UNIQUE INDEX "contas_plataforma_tipo_conta_key" ON "contas_plataforma"("tipo_conta");

-- CreateIndex
CREATE UNIQUE INDEX "recebiveis_transacao_comercial_id_usuario_recebedor_id_tipo_key" ON "recebiveis"("transacao_comercial_id", "usuario_recebedor_id", "tipo_recebedor");

-- CreateIndex
CREATE UNIQUE INDEX "recompensas_transacao_comercial_id_usuario_beneficiado_id_t_key" ON "recompensas"("transacao_comercial_id", "usuario_beneficiado_id", "tipo_recompensa");
