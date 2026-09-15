UPDATE "conversas_loja" AS conversation
SET "atendimento_solicitado_em" = COALESCE(
  conversation."ultima_mensagem_em",
  conversation."atualizado_em"
)
WHERE conversation."atendimento_solicitado_em" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "mensagens_conversa_loja" AS message
    WHERE message."conversa_loja_id" = conversation."id"
      AND message."origem" = 'CLIENTE'
  );

