-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "loja_origem_cadastro_id" INTEGER;

-- CreateIndex
CREATE INDEX "usuarios_loja_origem_cadastro_id_idx" ON "usuarios"("loja_origem_cadastro_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_loja_origem_cadastro_id_fkey" FOREIGN KEY ("loja_origem_cadastro_id") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
