-- AlterTable
ALTER TABLE "lojas" ADD COLUMN     "segmento_venda_id" INTEGER;

-- AlterTable
ALTER TABLE "segmentos_venda" ADD COLUMN     "categoria_loja_id" INTEGER,
ADD COLUMN     "negocia_pedido_por_chat" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "lojas_segmento_venda_id_idx" ON "lojas"("segmento_venda_id");

-- CreateIndex
CREATE INDEX "segmentos_venda_categoria_loja_id_idx" ON "segmentos_venda"("categoria_loja_id");

-- AddForeignKey
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentos_venda" ADD CONSTRAINT "segmentos_venda_categoria_loja_id_fkey" FOREIGN KEY ("categoria_loja_id") REFERENCES "categorias_loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
