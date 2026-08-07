-- CreateEnum
CREATE TYPE "TipoChamadaMotoboy" AS ENUM ('PLATAFORMA', 'EQUIPE');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoMotoboy" AS ENUM ('PENDENTE', 'ACEITA', 'CONCLUIDA', 'CANCELADA', 'EXPIRADA');

-- AlterTable
ALTER TABLE "cobrancas" ALTER COLUMN "expira_em" DROP NOT NULL;

-- CreateTable
CREATE TABLE "solicitacoes_motoboy" (
    "id" SERIAL NOT NULL,
    "loja_id" INTEGER NOT NULL,
    "solicitante_usuario_id" INTEGER NOT NULL,
    "tipo_servico_id" INTEGER NOT NULL,
    "pedido_loja_id" INTEGER,
    "motoboy_direcionado_id" INTEGER,
    "motoboy_aceite_id" INTEGER,
    "conversa_servico_id" INTEGER,
    "tipo_chamada" "TipoChamadaMotoboy" NOT NULL,
    "status" "StatusSolicitacaoMotoboy" NOT NULL DEFAULT 'PENDENTE',
    "origem" VARCHAR(300) NOT NULL,
    "destino" VARCHAR(300) NOT NULL,
    "descricao" TEXT,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "aceito_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "solicitacoes_motoboy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_motoboy_conversa_servico_id_key" ON "solicitacoes_motoboy"("conversa_servico_id");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_loja_id_status_idx" ON "solicitacoes_motoboy"("loja_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_solicitante_usuario_id_status_idx" ON "solicitacoes_motoboy"("solicitante_usuario_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_tipo_servico_id_status_idx" ON "solicitacoes_motoboy"("tipo_servico_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_motoboy_direcionado_id_status_idx" ON "solicitacoes_motoboy"("motoboy_direcionado_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_motoboy_aceite_id_idx" ON "solicitacoes_motoboy"("motoboy_aceite_id");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_pedido_loja_id_idx" ON "solicitacoes_motoboy"("pedido_loja_id");

-- CreateIndex
CREATE INDEX "solicitacoes_motoboy_expira_em_idx" ON "solicitacoes_motoboy"("expira_em");

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_solicitante_usuario_id_fkey" FOREIGN KEY ("solicitante_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_tipo_servico_id_fkey" FOREIGN KEY ("tipo_servico_id") REFERENCES "tipos_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_pedido_loja_id_fkey" FOREIGN KEY ("pedido_loja_id") REFERENCES "pedidos_loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_motoboy_direcionado_id_fkey" FOREIGN KEY ("motoboy_direcionado_id") REFERENCES "motoboys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_motoboy_aceite_id_fkey" FOREIGN KEY ("motoboy_aceite_id") REFERENCES "motoboys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_motoboy" ADD CONSTRAINT "solicitacoes_motoboy_conversa_servico_id_fkey" FOREIGN KEY ("conversa_servico_id") REFERENCES "conversas_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
