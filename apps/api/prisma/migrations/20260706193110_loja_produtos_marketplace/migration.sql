-- CreateEnum
CREATE TYPE "StatusProdutoLoja" AS ENUM ('ATIVO', 'INATIVO', 'ESGOTADO');

-- CreateTable
CREATE TABLE "produtos_loja" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "preco_centavos" BIGINT NOT NULL,
    "preco_promocional_centavos" BIGINT,
    "imagem_url" TEXT,
    "sku" VARCHAR(80),
    "status" "StatusProdutoLoja" NOT NULL DEFAULT 'ATIVO',
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "estoque_controlado" BOOLEAN NOT NULL DEFAULT false,
    "estoque_quantidade" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "produtos_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produtos_loja_loja_id_idx" ON "produtos_loja"("loja_id");

-- CreateIndex
CREATE INDEX "produtos_loja_status_idx" ON "produtos_loja"("status");

-- CreateIndex
CREATE INDEX "produtos_loja_destaque_idx" ON "produtos_loja"("destaque");

-- CreateIndex
CREATE INDEX "produtos_loja_ordem_idx" ON "produtos_loja"("ordem");

-- AddForeignKey
ALTER TABLE "produtos_loja" ADD CONSTRAINT "produtos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
