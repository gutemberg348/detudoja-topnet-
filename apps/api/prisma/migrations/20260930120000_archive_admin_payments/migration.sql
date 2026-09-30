ALTER TABLE "pagamentos" ADD COLUMN "arquivado_admin_em" TIMESTAMPTZ(3);

CREATE INDEX "pagamentos_arquivado_admin_em_idx" ON "pagamentos"("arquivado_admin_em");
