-- CreateEnum
CREATE TYPE "StatusConversaServico" AS ENUM ('ABERTA', 'ACORDADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemMensagemConversaServico" AS ENUM ('CLIENTE', 'VENDEDOR', 'SISTEMA');

-- AlterTable
ALTER TABLE "lojas" ADD COLUMN     "aberta_para_pedidos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "horarios_funcionamento" JSONB;

-- AlterTable
ALTER TABLE "segmentos_venda" ADD COLUMN     "atende_por_chat" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "atende_agora" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disponibilidade_atualizada_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "conversas_servico" (
    "id" SERIAL NOT NULL,
    "segmento_venda_id" INTEGER NOT NULL,
    "cliente_usuario_id" INTEGER NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "status" "StatusConversaServico" NOT NULL DEFAULT 'ABERTA',
    "origem" VARCHAR(180),
    "destino" VARCHAR(180),
    "descricao_inicial" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "encerrado_em" TIMESTAMPTZ(3),

    CONSTRAINT "conversas_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_conversa_servico" (
    "id" SERIAL NOT NULL,
    "conversa_servico_id" INTEGER NOT NULL,
    "autor_usuario_id" INTEGER,
    "origem" "OrigemMensagemConversaServico" NOT NULL,
    "mensagem" TEXT,
    "imagem_url" TEXT,
    "lido_cliente_em" TIMESTAMPTZ(3),
    "lido_vendedor_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_conversa_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversas_servico_cliente_usuario_id_status_idx" ON "conversas_servico"("cliente_usuario_id", "status");

-- CreateIndex
CREATE INDEX "conversas_servico_vendedor_id_status_idx" ON "conversas_servico"("vendedor_id", "status");

-- CreateIndex
CREATE INDEX "conversas_servico_segmento_venda_id_status_idx" ON "conversas_servico"("segmento_venda_id", "status");

-- CreateIndex
CREATE INDEX "conversas_servico_atualizado_em_idx" ON "conversas_servico"("atualizado_em");

-- CreateIndex
CREATE INDEX "mensagens_conversa_servico_conversa_servico_id_criado_em_idx" ON "mensagens_conversa_servico"("conversa_servico_id", "criado_em");

-- CreateIndex
CREATE INDEX "mensagens_conversa_servico_autor_usuario_id_idx" ON "mensagens_conversa_servico"("autor_usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_conversa_servico_origem_idx" ON "mensagens_conversa_servico"("origem");

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_segmento_venda_id_fkey" FOREIGN KEY ("segmento_venda_id") REFERENCES "segmentos_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_cliente_usuario_id_fkey" FOREIGN KEY ("cliente_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_conversa_servico" ADD CONSTRAINT "mensagens_conversa_servico_conversa_servico_id_fkey" FOREIGN KEY ("conversa_servico_id") REFERENCES "conversas_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_conversa_servico" ADD CONSTRAINT "mensagens_conversa_servico_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
