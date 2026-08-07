-- AlterTable
ALTER TABLE "segmentos_venda" ADD COLUMN     "percentual_cashback" DECIMAL(7,4),
ADD COLUMN     "percentual_indicacao_consumidor" DECIMAL(7,4),
ADD COLUMN     "percentual_indicacao_vendedor" DECIMAL(7,4),
ADD COLUMN     "percentual_rede" DECIMAL(7,4);
