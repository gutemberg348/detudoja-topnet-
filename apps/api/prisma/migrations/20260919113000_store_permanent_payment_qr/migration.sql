ALTER TABLE "lojas"
ADD COLUMN "qr_pagamento_token" VARCHAR(64),
ADD COLUMN "qr_pagamento_ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "qr_pagamento_atualizado_em" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "lojas_qr_pagamento_token_key"
ON "lojas"("qr_pagamento_token");

ALTER TABLE "cobrancas"
ADD COLUMN "chave_idempotencia" VARCHAR(120);

CREATE UNIQUE INDEX "cobrancas_chave_idempotencia_key"
ON "cobrancas"("chave_idempotencia");
