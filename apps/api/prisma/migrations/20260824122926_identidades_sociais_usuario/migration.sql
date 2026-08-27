-- CreateEnum
CREATE TYPE "ProvedorLoginSocial" AS ENUM ('GOOGLE', 'APPLE');

-- CreateTable
CREATE TABLE "identidades_sociais_usuario" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "provedor" "ProvedorLoginSocial" NOT NULL,
    "provedor_usuario_id" VARCHAR(255) NOT NULL,
    "email_provedor" VARCHAR(255),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "identidades_sociais_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identidades_sociais_usuario_usuario_id_idx" ON "identidades_sociais_usuario"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "identidades_sociais_usuario_provedor_provedor_usuario_id_key" ON "identidades_sociais_usuario"("provedor", "provedor_usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "identidades_sociais_usuario_usuario_id_provedor_key" ON "identidades_sociais_usuario"("usuario_id", "provedor");

-- AddForeignKey
ALTER TABLE "identidades_sociais_usuario" ADD CONSTRAINT "identidades_sociais_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
