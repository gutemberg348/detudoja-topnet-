-- AlterTable
ALTER TABLE "categorias_loja" ADD COLUMN     "segmento_venda_id" INTEGER;

-- CreateIndex
CREATE INDEX "categorias_loja_segmento_venda_id_idx" ON "categorias_loja"("segmento_venda_id");

-- AddForeignKey
ALTER TABLE "categorias_loja" ADD CONSTRAINT "categorias_loja_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
