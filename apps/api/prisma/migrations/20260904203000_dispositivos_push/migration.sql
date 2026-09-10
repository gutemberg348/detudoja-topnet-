CREATE TABLE "dispositivos_push" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "plataforma" VARCHAR(20) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_uso_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dispositivos_push_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispositivos_push_token_key" ON "dispositivos_push"("token");
CREATE INDEX "dispositivos_push_usuario_id_ativo_idx" ON "dispositivos_push"("usuario_id", "ativo");
CREATE INDEX "dispositivos_push_ultimo_uso_em_idx" ON "dispositivos_push"("ultimo_uso_em");

ALTER TABLE "dispositivos_push"
ADD CONSTRAINT "dispositivos_push_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
