-- CreateTable
CREATE TABLE "configuracoes_sistema" (
    "id" UUID NOT NULL,
    "chave" VARCHAR(120) NOT NULL,
    "valor_json" JSONB NOT NULL,
    "descricao" TEXT,
    "atualizado_por_admin_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_sistema_chave_key" ON "configuracoes_sistema"("chave");

-- CreateIndex
CREATE INDEX "configuracoes_sistema_atualizado_por_admin_id_idx" ON "configuracoes_sistema"("atualizado_por_admin_id");
