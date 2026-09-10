CREATE TABLE "auditorias_administrativas" (
    "id" SERIAL NOT NULL,
    "administrador_id" INTEGER NOT NULL,
    "usuario_alvo_id" INTEGER,
    "acao" VARCHAR(100) NOT NULL,
    "dados_json" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_administrativas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auditorias_administrativas_administrador_id_criado_em_idx"
ON "auditorias_administrativas"("administrador_id", "criado_em");

CREATE INDEX "auditorias_administrativas_usuario_alvo_id_criado_em_idx"
ON "auditorias_administrativas"("usuario_alvo_id", "criado_em");

CREATE INDEX "auditorias_administrativas_acao_criado_em_idx"
ON "auditorias_administrativas"("acao", "criado_em");

ALTER TABLE "auditorias_administrativas"
ADD CONSTRAINT "auditorias_administrativas_administrador_id_fkey"
FOREIGN KEY ("administrador_id") REFERENCES "administradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auditorias_administrativas"
ADD CONSTRAINT "auditorias_administrativas_usuario_alvo_id_fkey"
FOREIGN KEY ("usuario_alvo_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
