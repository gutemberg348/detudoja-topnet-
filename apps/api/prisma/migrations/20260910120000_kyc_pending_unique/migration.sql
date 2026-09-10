CREATE UNIQUE INDEX "solicitacoes_kyc_um_em_analise_por_usuario"
ON "solicitacoes_kyc" ("kyc_usuario_id")
WHERE "status" = 'EM_ANALISE';
