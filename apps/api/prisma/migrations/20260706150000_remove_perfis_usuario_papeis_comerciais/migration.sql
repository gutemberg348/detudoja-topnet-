-- Usuario continua sendo a conta base.
-- Lojista e vendedor passam a ser capacidades nas tabelas `lojistas` e `vendedores`.

UPDATE "usuarios"
SET "tipo_conta" = 'CONSUMIDOR'
WHERE "tipo_conta" IN ('LOJISTA', 'VENDEDOR');

DROP TABLE IF EXISTS "perfis_usuario";
DROP TYPE IF EXISTS "TipoPerfilUsuario";

ALTER TABLE "usuarios" ALTER COLUMN "tipo_conta" DROP DEFAULT;

CREATE TYPE "TipoContaUsuario_new" AS ENUM ('CONSUMIDOR', 'ADMIN', 'SUPORTE');

ALTER TABLE "usuarios"
ALTER COLUMN "tipo_conta" TYPE "TipoContaUsuario_new"
USING ("tipo_conta"::text::"TipoContaUsuario_new");

ALTER TABLE "usuarios" ALTER COLUMN "tipo_conta" SET DEFAULT 'CONSUMIDOR';

DROP TYPE "TipoContaUsuario";
ALTER TYPE "TipoContaUsuario_new" RENAME TO "TipoContaUsuario";
