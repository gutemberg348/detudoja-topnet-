ALTER TABLE "segmentos_venda"
ADD COLUMN "taxa_servico_online_centavos" BIGINT,
ADD COLUMN "taxa_processamento_local_centavos" BIGINT,
ADD COLUMN "limite_cashback_prioritario_centavos" BIGINT;

ALTER TABLE "lojas"
ADD COLUMN "taxa_servico_online_centavos" BIGINT,
ADD COLUMN "taxa_processamento_local_centavos" BIGINT,
ADD COLUMN "limite_cashback_prioritario_centavos" BIGINT;

ALTER TABLE "segmentos_venda"
ADD CONSTRAINT "segmentos_venda_taxa_servico_online_nao_negativa"
CHECK ("taxa_servico_online_centavos" IS NULL OR "taxa_servico_online_centavos" >= 0),
ADD CONSTRAINT "segmentos_venda_taxa_processamento_local_nao_negativa"
CHECK ("taxa_processamento_local_centavos" IS NULL OR "taxa_processamento_local_centavos" >= 0),
ADD CONSTRAINT "segmentos_venda_cashback_prioritario_nao_negativo"
CHECK ("limite_cashback_prioritario_centavos" IS NULL OR "limite_cashback_prioritario_centavos" >= 0);

ALTER TABLE "lojas"
ADD CONSTRAINT "lojas_taxa_servico_online_nao_negativa"
CHECK ("taxa_servico_online_centavos" IS NULL OR "taxa_servico_online_centavos" >= 0),
ADD CONSTRAINT "lojas_taxa_processamento_local_nao_negativa"
CHECK ("taxa_processamento_local_centavos" IS NULL OR "taxa_processamento_local_centavos" >= 0),
ADD CONSTRAINT "lojas_cashback_prioritario_nao_negativo"
CHECK ("limite_cashback_prioritario_centavos" IS NULL OR "limite_cashback_prioritario_centavos" >= 0);
