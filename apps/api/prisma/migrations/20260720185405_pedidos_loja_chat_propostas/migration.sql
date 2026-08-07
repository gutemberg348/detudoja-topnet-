-- CreateEnum
CREATE TYPE "StatusPropostaPedidoLoja" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA', 'PAGA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusPedidoLoja" ADD VALUE 'NEGOCIANDO';
ALTER TYPE "StatusPedidoLoja" ADD VALUE 'AGUARDANDO_PAGAMENTO';

-- AlterTable
ALTER TABLE "pedidos_loja" ALTER COLUMN "pagamento_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "propostas_pedido_loja" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "autor_usuario_id" INTEGER NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "descricao" TEXT,
    "status" "StatusPropostaPedidoLoja" NOT NULL DEFAULT 'PENDENTE',
    "respondido_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "propostas_pedido_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propostas_pedido_loja_pedido_id_criado_em_idx" ON "propostas_pedido_loja"("pedido_id", "criado_em");

-- CreateIndex
CREATE INDEX "propostas_pedido_loja_autor_usuario_id_idx" ON "propostas_pedido_loja"("autor_usuario_id");

-- CreateIndex
CREATE INDEX "propostas_pedido_loja_status_idx" ON "propostas_pedido_loja"("status");

-- AddForeignKey
ALTER TABLE "propostas_pedido_loja" ADD CONSTRAINT "propostas_pedido_loja_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_pedido_loja" ADD CONSTRAINT "propostas_pedido_loja_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
