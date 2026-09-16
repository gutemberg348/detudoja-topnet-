ALTER TABLE "usuarios"
ADD COLUMN "ganhos_rede_bloqueados" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ganhos_rede_bloqueados_em" TIMESTAMPTZ(3),
ADD COLUMN "motivo_bloqueio_ganhos_rede" VARCHAR(500);

CREATE INDEX "usuarios_ganhos_rede_bloqueados_idx"
ON "usuarios"("ganhos_rede_bloqueados");
