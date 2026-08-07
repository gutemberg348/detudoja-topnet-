-- CreateEnum
CREATE TYPE "StatusSegmentoVenda" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusVendaAutonoma" AS ENUM ('RASCUNHO', 'AGUARDANDO_PAGAMENTO', 'PAGA', 'CANCELADA', 'EXPIRADA');

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "cnpj" VARCHAR(18),
ADD COLUMN     "cpf" VARCHAR(14),
ADD COLUMN     "segmento_venda_id" UUID,
ADD COLUMN     "tipo_pessoa" "TipoPessoa";

-- CreateTable
CREATE TABLE "segmentos_venda" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "descricao" TEXT,
    "icone" VARCHAR(80),
    "status" "StatusSegmentoVenda" NOT NULL DEFAULT 'ATIVO',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "segmentos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_autonomas" (
    "id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "segmento_venda_id" UUID,
    "titulo" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "valor_centavos" BIGINT NOT NULL,
    "link_slug" VARCHAR(160) NOT NULL,
    "status" "StatusVendaAutonoma" NOT NULL DEFAULT 'RASCUNHO',
    "expira_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendas_autonomas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segmentos_venda_slug_key" ON "segmentos_venda"("slug");

-- CreateIndex
CREATE INDEX "segmentos_venda_nome_idx" ON "segmentos_venda"("nome");

-- CreateIndex
CREATE INDEX "segmentos_venda_status_idx" ON "segmentos_venda"("status");

-- CreateIndex
CREATE INDEX "segmentos_venda_ordem_idx" ON "segmentos_venda"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_autonomas_link_slug_key" ON "vendas_autonomas"("link_slug");

-- CreateIndex
CREATE INDEX "vendas_autonomas_vendedor_id_idx" ON "vendas_autonomas"("vendedor_id");

-- CreateIndex
CREATE INDEX "vendas_autonomas_segmento_venda_id_idx" ON "vendas_autonomas"("segmento_venda_id");

-- CreateIndex
CREATE INDEX "vendas_autonomas_status_idx" ON "vendas_autonomas"("status");

-- CreateIndex
CREATE INDEX "vendas_autonomas_criado_em_idx" ON "vendas_autonomas"("criado_em");

-- CreateIndex
CREATE INDEX "vendedores_cpf_idx" ON "vendedores"("cpf");

-- CreateIndex
CREATE INDEX "vendedores_cnpj_idx" ON "vendedores"("cnpj");

-- CreateIndex
CREATE INDEX "vendedores_segmento_venda_id_idx" ON "vendedores"("segmento_venda_id");

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_autonomas" ADD CONSTRAINT "vendas_autonomas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_autonomas" ADD CONSTRAINT "vendas_autonomas_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
