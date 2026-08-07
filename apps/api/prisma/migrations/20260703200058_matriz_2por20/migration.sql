/*
  Warnings:

  - A unique constraint covering the columns `[alocado_sob_usuario_id,posicao_matriz]` on the table `indicacoes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "indicacoes" ADD COLUMN     "alocado_sob_usuario_id" UUID,
ADD COLUMN     "nivel_matriz" INTEGER,
ADD COLUMN     "posicao_matriz" INTEGER;

-- CreateIndex
CREATE INDEX "indicacoes_alocado_sob_usuario_id_idx" ON "indicacoes"("alocado_sob_usuario_id");

-- CreateIndex
CREATE INDEX "indicacoes_nivel_matriz_idx" ON "indicacoes"("nivel_matriz");

-- CreateIndex
CREATE UNIQUE INDEX "indicacoes_alocado_sob_usuario_id_posicao_matriz_key" ON "indicacoes"("alocado_sob_usuario_id", "posicao_matriz");

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_alocado_sob_usuario_id_fkey" FOREIGN KEY ("alocado_sob_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
