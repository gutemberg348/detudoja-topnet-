-- CreateEnum
CREATE TYPE "StatusConversaLoja" AS ENUM ('ABERTA', 'ARQUIVADA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "OrigemMensagemConversaLoja" AS ENUM ('CLIENTE', 'LOJA', 'SISTEMA', 'ADMIN');

-- CreateTable
CREATE TABLE "conversas_loja" (
    "id" SERIAL NOT NULL,
    "loja_id" INTEGER NOT NULL,
    "cliente_usuario_id" INTEGER NOT NULL,
    "status" "StatusConversaLoja" NOT NULL DEFAULT 'ABERTA',
    "nao_lidas_cliente" INTEGER NOT NULL DEFAULT 0,
    "nao_lidas_loja" INTEGER NOT NULL DEFAULT 0,
    "ultima_mensagem_em" TIMESTAMPTZ(3),
    "arquivado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_conversa_loja" (
    "id" SERIAL NOT NULL,
    "conversa_loja_id" INTEGER NOT NULL,
    "autor_usuario_id" INTEGER,
    "origem" "OrigemMensagemConversaLoja" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lido_cliente_em" TIMESTAMPTZ(3),
    "lido_loja_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_conversa_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversas_loja_cliente_usuario_id_status_idx" ON "conversas_loja"("cliente_usuario_id", "status");

-- CreateIndex
CREATE INDEX "conversas_loja_loja_id_status_idx" ON "conversas_loja"("loja_id", "status");

-- CreateIndex
CREATE INDEX "conversas_loja_ultima_mensagem_em_idx" ON "conversas_loja"("ultima_mensagem_em");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_loja_loja_id_cliente_usuario_id_key" ON "conversas_loja"("loja_id", "cliente_usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_conversa_loja_conversa_loja_id_criado_em_idx" ON "mensagens_conversa_loja"("conversa_loja_id", "criado_em");

-- CreateIndex
CREATE INDEX "mensagens_conversa_loja_autor_usuario_id_idx" ON "mensagens_conversa_loja"("autor_usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_conversa_loja_lido_cliente_em_idx" ON "mensagens_conversa_loja"("lido_cliente_em");

-- CreateIndex
CREATE INDEX "mensagens_conversa_loja_lido_loja_em_idx" ON "mensagens_conversa_loja"("lido_loja_em");

-- AddForeignKey
ALTER TABLE "conversas_loja" ADD CONSTRAINT "conversas_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_loja" ADD CONSTRAINT "conversas_loja_cliente_usuario_id_fkey" FOREIGN KEY ("cliente_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_conversa_loja" ADD CONSTRAINT "mensagens_conversa_loja_conversa_loja_id_fkey" FOREIGN KEY ("conversa_loja_id") REFERENCES "conversas_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_conversa_loja" ADD CONSTRAINT "mensagens_conversa_loja_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
