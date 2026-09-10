ALTER TABLE "contas_bancarias"
  ADD COLUMN "validado_em" TIMESTAMPTZ(3),
  ADD COLUMN "provedor_validacao" VARCHAR(32);

-- Chaves que eram ativas antes da consulta de titularidade devem ser
-- confirmadas novamente; QR presencial e saque ficam bloqueados ate entao.
UPDATE "contas_bancarias"
SET
  "status" = 'PENDENTE',
  "validado_em" = NULL,
  "provedor_validacao" = NULL
WHERE "status" = 'ATIVA';
