-- CreateEnum
CREATE TYPE "TipoMensagemConversaLoja" AS ENUM ('TEXTO', 'PRODUTO', 'CATEGORIA', 'CATALOGO');

-- AlterTable
ALTER TABLE "mensagens_conversa_loja" ADD COLUMN     "conteudo_json" JSONB,
ADD COLUMN     "tipo" "TipoMensagemConversaLoja" NOT NULL DEFAULT 'TEXTO';
