CREATE TYPE "StatusConviteFuncionarioLoja" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO', 'REVOGADO', 'EXPIRADO');

CREATE TABLE "convites_funcionarios_loja" (
    "id" SERIAL NOT NULL,
    "loja_id" INTEGER NOT NULL,
    "convidado_usuario_id" INTEGER,
    "criado_por_usuario_id" INTEGER NOT NULL,
    "cargo" "CargoUsuarioLoja" NOT NULL DEFAULT 'ATENDENTE',
    "token_hash" VARCHAR(128) NOT NULL,
    "status" "StatusConviteFuncionarioLoja" NOT NULL DEFAULT 'PENDENTE',
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "aceito_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "convites_funcionarios_loja_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "convites_funcionarios_loja_token_hash_key" ON "convites_funcionarios_loja"("token_hash");
CREATE INDEX "convites_funcionarios_loja_loja_id_status_idx" ON "convites_funcionarios_loja"("loja_id", "status");
CREATE INDEX "convites_funcionarios_loja_convidado_usuario_id_status_idx" ON "convites_funcionarios_loja"("convidado_usuario_id", "status");
CREATE INDEX "convites_funcionarios_loja_expira_em_status_idx" ON "convites_funcionarios_loja"("expira_em", "status");

ALTER TABLE "convites_funcionarios_loja" ADD CONSTRAINT "convites_funcionarios_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "convites_funcionarios_loja" ADD CONSTRAINT "convites_funcionarios_loja_convidado_usuario_id_fkey" FOREIGN KEY ("convidado_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "convites_funcionarios_loja" ADD CONSTRAINT "convites_funcionarios_loja_criado_por_usuario_id_fkey" FOREIGN KEY ("criado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
