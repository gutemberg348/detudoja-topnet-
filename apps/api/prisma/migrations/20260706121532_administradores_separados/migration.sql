-- CreateEnum
CREATE TYPE "PapelAdministrador" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERACOES', 'SUPORTE', 'FINANCEIRO', 'COMPLIANCE', 'KYC');

-- CreateEnum
CREATE TYPE "StatusAdministrador" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "administradores" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telefone" VARCHAR(30),
    "senha_hash" VARCHAR(255) NOT NULL,
    "papel" "PapelAdministrador" NOT NULL DEFAULT 'ADMIN',
    "status" "StatusAdministrador" NOT NULL DEFAULT 'ATIVO',
    "ultimo_login_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "administradores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administradores_email_key" ON "administradores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "administradores_telefone_key" ON "administradores"("telefone");

-- CreateIndex
CREATE INDEX "administradores_status_idx" ON "administradores"("status");

-- CreateIndex
CREATE INDEX "administradores_papel_idx" ON "administradores"("papel");
