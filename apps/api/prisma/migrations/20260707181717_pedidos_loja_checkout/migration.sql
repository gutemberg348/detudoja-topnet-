-- CreateEnum
CREATE TYPE "StatusPedidoLoja" AS ENUM ('RECEBIDO', 'ACEITO', 'PREPARANDO', 'SAIU_ENTREGA', 'PRONTO_RETIRADA', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoEntregaPedido" AS ENUM ('ENTREGA', 'RETIRADA');

-- CreateTable
CREATE TABLE "pedidos_loja" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "endereco_entrega_id" UUID,
    "tipo_entrega" "TipoEntregaPedido" NOT NULL,
    "status" "StatusPedidoLoja" NOT NULL DEFAULT 'RECEBIDO',
    "subtotal_centavos" BIGINT NOT NULL,
    "taxa_entrega_centavos" BIGINT NOT NULL DEFAULT 0,
    "total_centavos" BIGINT NOT NULL,
    "valor_pago_saldo_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_pago_pix_centavos" BIGINT NOT NULL DEFAULT 0,
    "observacao_cliente" TEXT,
    "endereco_entrega_snapshot_json" JSONB,
    "aceito_em" TIMESTAMPTZ(3),
    "preparando_em" TIMESTAMPTZ(3),
    "saiu_entrega_em" TIMESTAMPTZ(3),
    "pronto_retirada_em" TIMESTAMPTZ(3),
    "concluido_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido_loja" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "produto_id" UUID,
    "nome_produto" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unitario_centavos" BIGINT NOT NULL,
    "valor_total_centavos" BIGINT NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "itens_pedido_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_loja_codigo_key" ON "pedidos_loja"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_loja_pagamento_id_key" ON "pedidos_loja"("pagamento_id");

-- CreateIndex
CREATE INDEX "pedidos_loja_usuario_id_idx" ON "pedidos_loja"("usuario_id");

-- CreateIndex
CREATE INDEX "pedidos_loja_loja_id_idx" ON "pedidos_loja"("loja_id");

-- CreateIndex
CREATE INDEX "pedidos_loja_endereco_entrega_id_idx" ON "pedidos_loja"("endereco_entrega_id");

-- CreateIndex
CREATE INDEX "pedidos_loja_status_idx" ON "pedidos_loja"("status");

-- CreateIndex
CREATE INDEX "pedidos_loja_tipo_entrega_idx" ON "pedidos_loja"("tipo_entrega");

-- CreateIndex
CREATE INDEX "pedidos_loja_criado_em_idx" ON "pedidos_loja"("criado_em");

-- CreateIndex
CREATE INDEX "itens_pedido_loja_pedido_id_idx" ON "itens_pedido_loja"("pedido_id");

-- CreateIndex
CREATE INDEX "itens_pedido_loja_produto_id_idx" ON "itens_pedido_loja"("produto_id");

-- AddForeignKey
ALTER TABLE "pedidos_loja" ADD CONSTRAINT "pedidos_loja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_loja" ADD CONSTRAINT "pedidos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_loja" ADD CONSTRAINT "pedidos_loja_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_loja" ADD CONSTRAINT "pedidos_loja_endereco_entrega_id_fkey" FOREIGN KEY ("endereco_entrega_id") REFERENCES "enderecos_usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_loja" ADD CONSTRAINT "itens_pedido_loja_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_loja" ADD CONSTRAINT "itens_pedido_loja_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos_loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
