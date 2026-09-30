ALTER TYPE "GatewayPagamento" ADD VALUE IF NOT EXISTS 'SICREDI';
ALTER TABLE "pagamentos" ADD COLUMN "gateway_ambiente" VARCHAR(20), ADD COLUMN "gateway_dados_json" JSONB;
ALTER TABLE "saques" ADD COLUMN "gateway_ambiente" VARCHAR(20);
ALTER TABLE "repasses_pix" ADD COLUMN "gateway_ambiente" VARCHAR(20);
