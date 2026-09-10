ALTER TABLE "pedidos_loja"
ADD COLUMN "taxa_servico_centavos" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "transacoes_comerciais"
ADD COLUMN "taxa_processamento_centavos" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "cashback_prioritario_centavos" BIGINT NOT NULL DEFAULT 0;
