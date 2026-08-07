-- AlterTable
ALTER TABLE "produtos_loja" ADD COLUMN     "aceita_entrega" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aceita_retirada" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "detalhes_json" JSONB,
ADD COLUMN     "marca" VARCHAR(120),
ADD COLUMN     "prazo_estimado_minutos" INTEGER,
ADD COLUMN     "resumo_curto" VARCHAR(220),
ADD COLUMN     "unidade_medida" VARCHAR(40);
