-- Presence expires without a foreground heartbeat, avoiding stale providers.
ALTER TABLE "servicos_vendedor"
ADD COLUMN "disponibilidade_atualizada_em" TIMESTAMPTZ(3);

UPDATE "servicos_vendedor"
SET "disponibilidade_atualizada_em" = CURRENT_TIMESTAMP
WHERE "disponivel_agora" = true;

CREATE INDEX "servicos_vendedor_disponivel_agora_disponibilidade_atualizada_em_idx"
ON "servicos_vendedor"("disponivel_agora", "disponibilidade_atualizada_em");

-- One unfinished direct service appointment per customer/provider service.
CREATE UNIQUE INDEX "conversas_servico_cliente_servico_ativas_key"
ON "conversas_servico"("cliente_usuario_id", "servico_vendedor_id")
WHERE "servico_vendedor_id" IS NOT NULL
  AND "loja_solicitante_id" IS NULL
  AND "pedido_loja_id" IS NULL
  AND "status" IN ('ABERTA', 'ACORDADA', 'AGUARDANDO_CONFIRMACAO');

CREATE TABLE "avaliacoes_servico" (
  "id" SERIAL NOT NULL,
  "conversa_servico_id" INTEGER NOT NULL,
  "avaliador_usuario_id" INTEGER NOT NULL,
  "vendedor_id" INTEGER NOT NULL,
  "nota" INTEGER NOT NULL,
  "comentario" VARCHAR(600),
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "avaliacoes_servico_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "avaliacoes_servico_nota_check" CHECK ("nota" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "avaliacoes_servico_conversa_servico_id_key"
ON "avaliacoes_servico"("conversa_servico_id");
CREATE INDEX "avaliacoes_servico_vendedor_id_criado_em_idx"
ON "avaliacoes_servico"("vendedor_id", "criado_em");
CREATE INDEX "avaliacoes_servico_avaliador_usuario_id_idx"
ON "avaliacoes_servico"("avaliador_usuario_id");

ALTER TABLE "avaliacoes_servico"
ADD CONSTRAINT "avaliacoes_servico_conversa_servico_id_fkey"
FOREIGN KEY ("conversa_servico_id") REFERENCES "conversas_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_servico"
ADD CONSTRAINT "avaliacoes_servico_avaliador_usuario_id_fkey"
FOREIGN KEY ("avaliador_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_servico"
ADD CONSTRAINT "avaliacoes_servico_vendedor_id_fkey"
FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
