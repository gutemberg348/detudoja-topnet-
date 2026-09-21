CREATE TABLE "recusas_solicitacao_motoboy" (
  "id" SERIAL NOT NULL,
  "solicitacao_id" INTEGER NOT NULL,
  "motoboy_id" INTEGER NOT NULL,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recusas_solicitacao_motoboy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recusas_solicitacao_motoboy_solicitacao_id_motoboy_id_key"
  ON "recusas_solicitacao_motoboy"("solicitacao_id", "motoboy_id");
CREATE INDEX "recusas_solicitacao_motoboy_motoboy_id_criado_em_idx"
  ON "recusas_solicitacao_motoboy"("motoboy_id", "criado_em");

ALTER TABLE "recusas_solicitacao_motoboy"
  ADD CONSTRAINT "recusas_solicitacao_motoboy_solicitacao_id_fkey"
  FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_motoboy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recusas_solicitacao_motoboy"
  ADD CONSTRAINT "recusas_solicitacao_motoboy_motoboy_id_fkey"
  FOREIGN KEY ("motoboy_id") REFERENCES "motoboys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
