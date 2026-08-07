-- CreateEnum
CREATE TYPE "StatusMotoboy" AS ENUM ('ATIVO', 'PAUSADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoOperacaoServico" AS ENUM ('GERAL', 'ENTREGA_LOCAL');

-- AlterTable
ALTER TABLE "conversas_servico" ADD COLUMN     "loja_solicitante_id" INTEGER,
ADD COLUMN     "pedido_loja_id" INTEGER;

-- AlterTable
ALTER TABLE "segmentos_venda" ALTER COLUMN "taxa_plataforma_percentual" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "tipos_servico" ADD COLUMN     "tipo_operacao" "TipoOperacaoServico" NOT NULL DEFAULT 'GERAL';

-- CreateTable
CREATE TABLE "motoboys" (
    "id" SERIAL NOT NULL,
    "vendedor_id" INTEGER NOT NULL,
    "nome_exibicao" VARCHAR(180) NOT NULL,
    "telefone_contato" VARCHAR(30) NOT NULL,
    "cnh" VARCHAR(20) NOT NULL,
    "placa" VARCHAR(10) NOT NULL,
    "modelo_moto" VARCHAR(120) NOT NULL,
    "cor_moto" VARCHAR(60),
    "cidade_base" VARCHAR(120) NOT NULL,
    "estado_base" CHAR(2) NOT NULL,
    "raio_atendimento_km" INTEGER NOT NULL DEFAULT 10,
    "status" "StatusMotoboy" NOT NULL DEFAULT 'ATIVO',
    "total_entregas" INTEGER NOT NULL DEFAULT 0,
    "avaliacao_media" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "motoboys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motoboys_loja" (
    "id" SERIAL NOT NULL,
    "loja_id" INTEGER NOT NULL,
    "motoboy_id" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "motoboys_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motoboys_vendedor_id_key" ON "motoboys"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "motoboys_cnh_key" ON "motoboys"("cnh");

-- CreateIndex
CREATE UNIQUE INDEX "motoboys_placa_key" ON "motoboys"("placa");

-- CreateIndex
CREATE INDEX "motoboys_cidade_base_estado_base_status_idx" ON "motoboys"("cidade_base", "estado_base", "status");

-- CreateIndex
CREATE INDEX "motoboys_placa_idx" ON "motoboys"("placa");

-- CreateIndex
CREATE INDEX "motoboys_loja_loja_id_ativo_idx" ON "motoboys_loja"("loja_id", "ativo");

-- CreateIndex
CREATE INDEX "motoboys_loja_motoboy_id_ativo_idx" ON "motoboys_loja"("motoboy_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "motoboys_loja_loja_id_motoboy_id_key" ON "motoboys_loja"("loja_id", "motoboy_id");

-- CreateIndex
CREATE INDEX "conversas_servico_loja_solicitante_id_idx" ON "conversas_servico"("loja_solicitante_id");

-- CreateIndex
CREATE INDEX "conversas_servico_pedido_loja_id_idx" ON "conversas_servico"("pedido_loja_id");

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_loja_solicitante_id_fkey" FOREIGN KEY ("loja_solicitante_id") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_servico" ADD CONSTRAINT "conversas_servico_pedido_loja_id_fkey" FOREIGN KEY ("pedido_loja_id") REFERENCES "pedidos_loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motoboys" ADD CONSTRAINT "motoboys_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motoboys_loja" ADD CONSTRAINT "motoboys_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motoboys_loja" ADD CONSTRAINT "motoboys_loja_motoboy_id_fkey" FOREIGN KEY ("motoboy_id") REFERENCES "motoboys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
