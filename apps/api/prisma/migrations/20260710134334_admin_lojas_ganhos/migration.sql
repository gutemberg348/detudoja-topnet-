/*
  Warnings:

  - You are about to drop the column `taxa_plataforma_padrao_percentual` on the `lojas` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "categorias_loja" ADD COLUMN     "taxa_plataforma_atualizada_em" TIMESTAMPTZ(3),
ADD COLUMN     "taxa_plataforma_percentual" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "lojas" DROP COLUMN "taxa_plataforma_padrao_percentual",
ADD COLUMN     "taxa_plataforma_alterada_em" TIMESTAMPTZ(3),
ADD COLUMN     "taxa_plataforma_alterada_por_admin_id" INTEGER,
ADD COLUMN     "taxa_plataforma_personalizada_percentual" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "segmentos_venda" ADD COLUMN     "taxa_plataforma_atualizada_em" TIMESTAMPTZ(3),
ADD COLUMN     "taxa_plataforma_percentual" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "lojas_taxa_plataforma_alterada_por_admin_id_idx" ON "lojas"("taxa_plataforma_alterada_por_admin_id");
