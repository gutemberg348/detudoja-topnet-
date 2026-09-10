ALTER TABLE "lojas"
ADD COLUMN "taxa_entrega_centavos" BIGINT NOT NULL DEFAULT 790;

ALTER TABLE "transacoes_comerciais"
ADD COLUMN "base_comissao_centavos" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "valor_entrega_lojista_centavos" BIGINT NOT NULL DEFAULT 0;

-- Transacoes anteriores nao separavam a base de comissao. Elas nao possuiam
-- entrega liquidada e preservam integralmente o valor bruto historico.
UPDATE "transacoes_comerciais"
SET "base_comissao_centavos" = "valor_bruto_centavos";
