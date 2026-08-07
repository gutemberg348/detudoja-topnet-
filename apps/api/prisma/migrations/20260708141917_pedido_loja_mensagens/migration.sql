-- CreateEnum
CREATE TYPE "OrigemMensagemPedidoLoja" AS ENUM ('SISTEMA', 'CLIENTE', 'LOJA', 'ADMIN');

-- CreateTable
CREATE TABLE "mensagens_pedido_loja" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "autor_usuario_id" UUID,
    "origem" "OrigemMensagemPedidoLoja" NOT NULL,
    "titulo" VARCHAR(120),
    "mensagem" TEXT NOT NULL,
    "metadata_json" JSONB,
    "lido_cliente_em" TIMESTAMPTZ(3),
    "lido_loja_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mensagens_pedido_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagens_pedido_loja_pedido_id_criado_em_idx" ON "mensagens_pedido_loja"("pedido_id", "criado_em");

-- CreateIndex
CREATE INDEX "mensagens_pedido_loja_autor_usuario_id_idx" ON "mensagens_pedido_loja"("autor_usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_pedido_loja_origem_idx" ON "mensagens_pedido_loja"("origem");

-- AddForeignKey
ALTER TABLE "mensagens_pedido_loja" ADD CONSTRAINT "mensagens_pedido_loja_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_pedido_loja" ADD CONSTRAINT "mensagens_pedido_loja_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
