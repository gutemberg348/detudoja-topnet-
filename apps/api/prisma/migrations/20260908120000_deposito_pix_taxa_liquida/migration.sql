ALTER TABLE "depositos_carteira"
ADD COLUMN "taxa_processamento_centavos" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "valor_liquido_centavos" BIGINT NOT NULL DEFAULT 0;

-- Depositos anteriores mantem o valor historicamente creditado. A taxa de
-- R$ 0,99 vale somente para novas tentativas criadas depois desta migration.
UPDATE "depositos_carteira"
SET "valor_liquido_centavos" = "valor_centavos";
