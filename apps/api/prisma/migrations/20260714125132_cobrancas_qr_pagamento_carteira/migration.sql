-- CreateEnum
CREATE TYPE "OrigemCobranca" AS ENUM ('PRESENCIAL', 'AVULSA');

-- CreateEnum
CREATE TYPE "StatusCobranca" AS ENUM ('ATIVA', 'PROCESSANDO', 'PAGA', 'CANCELADA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" SERIAL NOT NULL,
    "codigo_publico" VARCHAR(64) NOT NULL,
    "criador_usuario_id" INTEGER NOT NULL,
    "loja_id" INTEGER,
    "vendedor_id" INTEGER,
    "venda_autonoma_id" INTEGER,
    "pagamento_id" INTEGER,
    "origem" "OrigemCobranca" NOT NULL,
    "titulo" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "valor_centavos" BIGINT NOT NULL,
    "status" "StatusCobranca" NOT NULL DEFAULT 'ATIVA',
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "paga_em" TIMESTAMPTZ(3),
    "cancelada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_codigo_publico_key" ON "cobrancas"("codigo_publico");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_venda_autonoma_id_key" ON "cobrancas"("venda_autonoma_id");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_pagamento_id_key" ON "cobrancas"("pagamento_id");

-- CreateIndex
CREATE INDEX "cobrancas_criador_usuario_id_idx" ON "cobrancas"("criador_usuario_id");

-- CreateIndex
CREATE INDEX "cobrancas_loja_id_idx" ON "cobrancas"("loja_id");

-- CreateIndex
CREATE INDEX "cobrancas_vendedor_id_idx" ON "cobrancas"("vendedor_id");

-- CreateIndex
CREATE INDEX "cobrancas_status_idx" ON "cobrancas"("status");

-- CreateIndex
CREATE INDEX "cobrancas_expira_em_idx" ON "cobrancas"("expira_em");

-- CreateIndex
CREATE INDEX "cobrancas_criado_em_idx" ON "cobrancas"("criado_em");

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_criador_usuario_id_fkey" FOREIGN KEY ("criador_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_venda_autonoma_id_fkey" FOREIGN KEY ("venda_autonoma_id") REFERENCES "vendas_autonomas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
