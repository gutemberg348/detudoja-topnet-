/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `lojistas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cnpj]` on the table `lojistas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cpf]` on the table `vendedores` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cnpj]` on the table `vendedores` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "lojistas_cnpj_idx";

-- DropIndex
DROP INDEX "lojistas_cpf_idx";

-- DropIndex
DROP INDEX "vendedores_cnpj_idx";

-- DropIndex
DROP INDEX "vendedores_cpf_idx";

-- CreateIndex
CREATE UNIQUE INDEX "lojistas_cpf_key" ON "lojistas"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "lojistas_cnpj_key" ON "lojistas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_cpf_key" ON "vendedores"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_cnpj_key" ON "vendedores"("cnpj");
