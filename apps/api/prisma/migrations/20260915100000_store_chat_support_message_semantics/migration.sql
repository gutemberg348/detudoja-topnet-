-- Suporte e uma marcacao de mensagem, nao um bloqueio permanente da conversa.
-- Corrige o preenchimento legado para manter apenas a data da ultima mensagem
-- que foi enviada explicitamente como suporte.
UPDATE "conversas_loja" AS conversation
SET "atendimento_solicitado_em" = (
  SELECT MAX(message."criado_em")
  FROM "mensagens_conversa_loja" AS message
  WHERE message."conversa_loja_id" = conversation."id"
    AND message."origem" = 'CLIENTE'
    AND message."conteudo_json" ->> 'kind' = 'SUPPORT'
);
