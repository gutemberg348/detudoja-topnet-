CREATE TYPE "TipoDocumentoKyc" AS ENUM ('RG', 'CNH', 'RNE');
CREATE TYPE "TipoArquivoKyc" AS ENUM ('DOCUMENTO_FRENTE', 'DOCUMENTO_VERSO', 'SELFIE');

CREATE TABLE "solicitacoes_kyc" (
    "id" SERIAL NOT NULL,
    "kyc_usuario_id" INTEGER NOT NULL,
    "tipo_documento" "TipoDocumentoKyc" NOT NULL,
    "status" "StatusKyc" NOT NULL DEFAULT 'EM_ANALISE',
    "triagem_json" JSONB NOT NULL,
    "motivo_decisao" TEXT,
    "analisado_por_admin_id" INTEGER,
    "enviado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analisado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "solicitacoes_kyc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "arquivos_kyc" (
    "id" SERIAL NOT NULL,
    "solicitacao_id" INTEGER NOT NULL,
    "tipo" "TipoArquivoKyc" NOT NULL,
    "caminho_privado" TEXT NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "brilho_medio" DECIMAL(6,2),
    "contraste_medio" DECIMAL(6,2),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arquivos_kyc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacoes_kyc_kyc_usuario_id_enviado_em_idx" ON "solicitacoes_kyc"("kyc_usuario_id", "enviado_em");
CREATE INDEX "solicitacoes_kyc_status_enviado_em_idx" ON "solicitacoes_kyc"("status", "enviado_em");
CREATE INDEX "solicitacoes_kyc_analisado_por_admin_id_idx" ON "solicitacoes_kyc"("analisado_por_admin_id");
CREATE UNIQUE INDEX "solicitacoes_kyc_uma_em_analise_por_usuario_idx" ON "solicitacoes_kyc"("kyc_usuario_id") WHERE "status" = 'EM_ANALISE';
CREATE UNIQUE INDEX "arquivos_kyc_solicitacao_id_tipo_key" ON "arquivos_kyc"("solicitacao_id", "tipo");
CREATE INDEX "arquivos_kyc_sha256_idx" ON "arquivos_kyc"("sha256");

ALTER TABLE "solicitacoes_kyc" ADD CONSTRAINT "solicitacoes_kyc_kyc_usuario_id_fkey" FOREIGN KEY ("kyc_usuario_id") REFERENCES "kyc_usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacoes_kyc" ADD CONSTRAINT "solicitacoes_kyc_analisado_por_admin_id_fkey" FOREIGN KEY ("analisado_por_admin_id") REFERENCES "administradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivos_kyc" ADD CONSTRAINT "arquivos_kyc_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_kyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
