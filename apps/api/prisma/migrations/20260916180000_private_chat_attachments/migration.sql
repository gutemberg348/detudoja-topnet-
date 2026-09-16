ALTER TABLE "conversas_pessoais_mensagens"
ALTER COLUMN "mensagem" DROP NOT NULL,
ADD COLUMN "anexo_json" JSONB;

ALTER TABLE "mensagens_conversa_loja"
ALTER COLUMN "mensagem" DROP NOT NULL;

ALTER TABLE "mensagens_conversa_servico"
ADD COLUMN "anexo_json" JSONB;

ALTER TABLE "mensagens_pedido_loja"
ALTER COLUMN "mensagem" DROP NOT NULL;
