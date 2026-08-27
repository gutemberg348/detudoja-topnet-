/*
  Warnings:

  - A unique constraint covering the columns `[gateway,gateway_pagamento_id]` on the table `pagamentos` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[asaas_cliente_id]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "motoboys" ADD COLUMN     "aceita_chamadas_plataforma" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "asaas_cliente_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "eventos_gateway_pagamento" (
    "id" SERIAL NOT NULL,
    "gateway" "GatewayPagamento" NOT NULL,
    "gateway_evento_id" VARCHAR(255) NOT NULL,
    "tipo_evento" VARCHAR(120) NOT NULL,
    "pagamento_id" INTEGER,
    "payload_json" JSONB NOT NULL,
    "processado_em" TIMESTAMPTZ(3),
    "erro_processamento" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eventos_gateway_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventos_gateway_pagamento_gateway_evento_id_key" ON "eventos_gateway_pagamento"("gateway_evento_id");

-- CreateIndex
CREATE INDEX "eventos_gateway_pagamento_gateway_idx" ON "eventos_gateway_pagamento"("gateway");

-- CreateIndex
CREATE INDEX "eventos_gateway_pagamento_pagamento_id_idx" ON "eventos_gateway_pagamento"("pagamento_id");

-- CreateIndex
CREATE INDEX "eventos_gateway_pagamento_tipo_evento_idx" ON "eventos_gateway_pagamento"("tipo_evento");

-- CreateIndex
CREATE INDEX "eventos_gateway_pagamento_criado_em_idx" ON "eventos_gateway_pagamento"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_gateway_gateway_pagamento_id_key" ON "pagamentos"("gateway", "gateway_pagamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_asaas_cliente_id_key" ON "usuarios"("asaas_cliente_id");

-- AddForeignKey
ALTER TABLE "eventos_gateway_pagamento" ADD CONSTRAINT "eventos_gateway_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
