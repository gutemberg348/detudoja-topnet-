ALTER TABLE "dispositivos_push" ADD COLUMN "canais_notificacao" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "notificacoes_push" (
    "id" UUID NOT NULL,
    "dispositivo_id" INTEGER NOT NULL,
    "destinatario_usuario_id" INTEGER NOT NULL,
    "conteudo" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueado_ate" TIMESTAMPTZ(3),
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "ticket_id" VARCHAR(255),
    "ultimo_erro" VARCHAR(80),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notificacoes_push_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notificacoes_push_status_proxima_tentativa_em_idx" ON "notificacoes_push"("status", "proxima_tentativa_em");
CREATE INDEX "notificacoes_push_destinatario_usuario_id_criado_em_idx" ON "notificacoes_push"("destinatario_usuario_id", "criado_em");
CREATE INDEX "notificacoes_push_criado_em_idx" ON "notificacoes_push"("criado_em");
ALTER TABLE "notificacoes_push" ADD CONSTRAINT "notificacoes_push_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos_push"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificacoes_push" ADD CONSTRAINT "notificacoes_push_destinatario_usuario_id_fkey" FOREIGN KEY ("destinatario_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
