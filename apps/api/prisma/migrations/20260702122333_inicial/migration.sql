-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO', 'PENDENTE', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "TipoContaUsuario" AS ENUM ('CONSUMIDOR', 'LOJISTA', 'VENDEDOR', 'ADMIN', 'SUPORTE');

-- CreateEnum
CREATE TYPE "NivelKyc" AS ENUM ('TIER_1', 'TIER_2', 'REPROVADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoPerfilUsuario" AS ENUM ('CONSUMIDOR', 'LOJISTA', 'VENDEDOR', 'ADMIN', 'SUPORTE', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "StatusKyc" AS ENUM ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'REPROVADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoChavePix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');

-- CreateEnum
CREATE TYPE "TipoContaBancaria" AS ENUM ('CORRENTE', 'POUPANCA', 'PAGAMENTO');

-- CreateEnum
CREATE TYPE "StatusContaBancaria" AS ENUM ('ATIVA', 'INATIVA', 'PENDENTE', 'BLOQUEADA', 'REPROVADA');

-- CreateEnum
CREATE TYPE "TipoIndicacao" AS ENUM ('CONSUMIDOR', 'LOJISTA', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "StatusIndicacao" AS ENUM ('PENDENTE', 'ATIVA', 'CONVERTIDA', 'CANCELADA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "StatusLojista" AS ENUM ('PENDENTE', 'ATIVO', 'PAUSADO', 'BLOQUEADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusCategoriaLoja" AS ENUM ('ATIVA', 'INATIVA');

-- CreateEnum
CREATE TYPE "StatusLoja" AS ENUM ('RASCUNHO', 'EM_ANALISE', 'ATIVA', 'PAUSADA', 'BLOQUEADA', 'REPROVADA');

-- CreateEnum
CREATE TYPE "CargoUsuarioLoja" AS ENUM ('DONO', 'GERENTE', 'CAIXA', 'ATENDENTE', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "StatusUsuarioLoja" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "StatusVendedor" AS ENUM ('PENDENTE', 'ATIVO', 'PAUSADO', 'BLOQUEADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusServicoVendedor" AS ENUM ('ATIVO', 'INATIVO', 'PAUSADO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "StatusTipoCarteira" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusCarteira" AS ENUM ('ATIVA', 'BLOQUEADA', 'INATIVA');

-- CreateEnum
CREATE TYPE "TipoLancamentoCarteira" AS ENUM ('CREDITO', 'DEBITO', 'BLOQUEIO', 'DESBLOQUEIO', 'ESTORNO', 'EXPIRACAO', 'AJUSTE_MANUAL');

-- CreateEnum
CREATE TYPE "OrigemLancamentoCarteira" AS ENUM ('PAGAMENTO', 'VENDA', 'CASHBACK', 'BONUS_INDICACAO', 'BONUS_VENDEDOR', 'SAQUE', 'ESTORNO', 'CAMPANHA', 'AJUSTE_ADMIN');

-- CreateEnum
CREATE TYPE "StatusLancamentoCarteira" AS ENUM ('PENDENTE', 'PROCESSADO', 'BLOQUEADO', 'ESTORNADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO', 'SALDO_PIX', 'CASHBACK', 'BONUS', 'MISTO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'LIQUIDADO', 'CANCELADO', 'ESTORNADO', 'FALHOU', 'EM_DISPUTA');

-- CreateEnum
CREATE TYPE "GatewayPagamento" AS ENUM ('INTERNO', 'PAGARME', 'MERCADO_PAGO', 'ASAAS', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoItemPagamento" AS ENUM ('PRODUTO', 'SERVICO', 'TAXA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoOrigemPagamento" AS ENUM ('PIX', 'CARTAO', 'SALDO_PIX', 'CASHBACK', 'BONUS');

-- CreateEnum
CREATE TYPE "StatusPagamentoComposicao" AS ENUM ('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "StatusTransacaoComercial" AS ENUM ('PENDENTE', 'PAGA', 'VALIDADA', 'LIQUIDADA', 'CANCELADA', 'ESTORNADA', 'FRAUDE');

-- CreateEnum
CREATE TYPE "TipoRecebedor" AS ENUM ('LOJISTA', 'VENDEDOR', 'PLATAFORMA');

-- CreateEnum
CREATE TYPE "StatusRecebivel" AS ENUM ('PENDENTE', 'AGUARDANDO_LIQUIDACAO', 'DISPONIVEL', 'BLOQUEADO', 'PAGO', 'ESTORNADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoRecompensa" AS ENUM ('CASHBACK_COMPRADOR', 'BONUS_INDICACAO_CONSUMIDOR', 'BONUS_INDICACAO_LOJISTA', 'BONUS_VENDEDOR', 'CAMPANHA_PROMOCIONAL');

-- CreateEnum
CREATE TYPE "StatusRecompensa" AS ENUM ('PENDENTE', 'LIBERADA', 'BLOQUEADA', 'ESTORNADA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCampanhaCashback" AS ENUM ('RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusSaque" AS ENUM ('SOLICITADO', 'EM_ANALISE', 'APROVADO', 'PROCESSANDO', 'PAGO', 'RECUSADO', 'CANCELADO', 'FALHOU');

-- CreateEnum
CREATE TYPE "TipoTaxaPlataforma" AS ENUM ('PAGAMENTO_QRCODE', 'MARKETPLACE', 'AQUISICAO_CLIENTE', 'CAMPANHA_CASHBACK', 'SERVICO_VENDEDOR', 'DELIVERY_FUTURO');

-- CreateEnum
CREATE TYPE "StatusTaxaPlataforma" AS ENUM ('ATIVA', 'INATIVA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "TipoContaPlataforma" AS ENUM ('RECEITA_EMPRESA', 'POOL_RECOMPENSAS', 'TAXAS_PAGAMENTO', 'RESERVA_OPERACIONAL');

-- CreateEnum
CREATE TYPE "StatusContaPlataforma" AS ENUM ('ATIVA', 'INATIVA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "TipoLancamentoPlataforma" AS ENUM ('CREDITO', 'DEBITO', 'AJUSTE', 'ESTORNO', 'RESERVA');

-- CreateEnum
CREATE TYPE "StatusLancamentoPlataforma" AS ENUM ('PENDENTE', 'PROCESSADO', 'CANCELADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "TipoComprovante" AS ENUM ('PIX', 'CARTAO', 'RECIBO_INTERNO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoDocumentoFiscal" AS ENUM ('NFC_E', 'NF_E', 'NFS_E', 'RECIBO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusDocumentoFiscal" AS ENUM ('PENDENTE', 'EMITIDO', 'CANCELADO', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoEventoFinanceiro" AS ENUM ('PAGAMENTO_CRIADO', 'PAGAMENTO_APROVADO', 'PAGAMENTO_LIQUIDADO', 'CASHBACK_GERADO', 'BONUS_GERADO', 'SALDO_LIBERADO', 'SAQUE_SOLICITADO', 'SAQUE_PAGO', 'ESTORNO_REALIZADO', 'BLOQUEIO_FINANCEIRO', 'AJUSTE_MANUAL');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telefone" VARCHAR(30),
    "cpf" VARCHAR(14),
    "senha_hash" VARCHAR(255) NOT NULL,
    "data_nascimento" DATE,
    "foto_url" TEXT,
    "status" "StatusUsuario" NOT NULL DEFAULT 'PENDENTE',
    "tipo_conta" "TipoContaUsuario" NOT NULL DEFAULT 'CONSUMIDOR',
    "nivel_kyc" "NivelKyc" NOT NULL DEFAULT 'TIER_1',
    "email_verificado" BOOLEAN NOT NULL DEFAULT false,
    "telefone_verificado" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "perfil" "TipoPerfilUsuario" NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "perfis_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome_endereco" VARCHAR(80),
    "cep" VARCHAR(9) NOT NULL,
    "estado" CHAR(2) NOT NULL,
    "cidade" VARCHAR(120) NOT NULL,
    "bairro" VARCHAR(120) NOT NULL,
    "rua" VARCHAR(180) NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "complemento" VARCHAR(180),
    "referencia" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "enderecos_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_usuarios" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_pessoa" "TipoPessoa" NOT NULL,
    "cpf" VARCHAR(14),
    "cnpj" VARCHAR(18),
    "nome_completo" VARCHAR(180),
    "razao_social" VARCHAR(180),
    "nome_fantasia" VARCHAR(180),
    "documento_frente_url" TEXT,
    "documento_verso_url" TEXT,
    "selfie_url" TEXT,
    "status" "StatusKyc" NOT NULL DEFAULT 'PENDENTE',
    "motivo_reprovacao" TEXT,
    "validado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kyc_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_chave" "TipoChavePix",
    "chave_pix" VARCHAR(255),
    "banco" VARCHAR(120),
    "agencia" VARCHAR(20),
    "conta" VARCHAR(30),
    "tipo_conta" "TipoContaBancaria",
    "nome_titular" VARCHAR(180) NOT NULL,
    "documento_titular" VARCHAR(18) NOT NULL,
    "status" "StatusContaBancaria" NOT NULL DEFAULT 'PENDENTE',
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_convite" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usos_totais" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "expira_em" TIMESTAMPTZ(3),

    CONSTRAINT "codigos_convite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicacoes" (
    "id" UUID NOT NULL,
    "indicador_usuario_id" UUID NOT NULL,
    "indicado_usuario_id" UUID NOT NULL,
    "codigo_convite_id" UUID,
    "tipo_indicacao" "TipoIndicacao" NOT NULL,
    "origem" VARCHAR(120),
    "status" "StatusIndicacao" NOT NULL DEFAULT 'PENDENTE',
    "primeira_compra_em" TIMESTAMPTZ(3),
    "primeira_venda_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "indicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lojistas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_pessoa" "TipoPessoa" NOT NULL,
    "cpf" VARCHAR(14),
    "cnpj" VARCHAR(18),
    "razao_social" VARCHAR(180),
    "nome_fantasia" VARCHAR(180),
    "status_kyc" "StatusKyc" NOT NULL DEFAULT 'PENDENTE',
    "status" "StatusLojista" NOT NULL DEFAULT 'PENDENTE',
    "limite_faturamento_mensal_centavos" BIGINT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "lojistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_loja" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "icone_url" TEXT,
    "status" "StatusCategoriaLoja" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "categorias_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lojas" (
    "id" UUID NOT NULL,
    "lojista_id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "categoria_id" UUID NOT NULL,
    "telefone" VARCHAR(30),
    "whatsapp" VARCHAR(30),
    "email" VARCHAR(255),
    "logo_url" TEXT,
    "banner_url" TEXT,
    "status" "StatusLoja" NOT NULL DEFAULT 'RASCUNHO',
    "visivel_no_app" BOOLEAN NOT NULL DEFAULT false,
    "aceita_pagamento_online" BOOLEAN NOT NULL DEFAULT false,
    "aceita_qrcode" BOOLEAN NOT NULL DEFAULT false,
    "taxa_plataforma_padrao_percentual" DECIMAL(7,4),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos_loja" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "cep" VARCHAR(9) NOT NULL,
    "estado" CHAR(2) NOT NULL,
    "cidade" VARCHAR(120) NOT NULL,
    "bairro" VARCHAR(120) NOT NULL,
    "rua" VARCHAR(180) NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "complemento" VARCHAR(180),
    "referencia" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enderecos_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_loja" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cargo" "CargoUsuarioLoja" NOT NULL,
    "permissoes" JSONB,
    "status" "StatusUsuarioLoja" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome_publico" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "categoria" VARCHAR(120),
    "status" "StatusVendedor" NOT NULL DEFAULT 'PENDENTE',
    "status_kyc" "StatusKyc" NOT NULL DEFAULT 'PENDENTE',
    "aceita_servicos" BOOLEAN NOT NULL DEFAULT true,
    "avaliacao_media" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_vendas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos_vendedor" (
    "id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "preco_centavos" BIGINT NOT NULL,
    "categoria" VARCHAR(120),
    "status" "StatusServicoVendedor" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "servicos_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_carteira" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "permite_saque" BOOLEAN NOT NULL DEFAULT false,
    "permite_uso_em_compra" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusTipoCarteira" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tipos_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carteiras" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_carteira_id" UUID NOT NULL,
    "saldo_disponivel_centavos" BIGINT NOT NULL DEFAULT 0,
    "saldo_pendente_centavos" BIGINT NOT NULL DEFAULT 0,
    "saldo_bloqueado_centavos" BIGINT NOT NULL DEFAULT 0,
    "status" "StatusCarteira" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carteiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_carteira" (
    "id" UUID NOT NULL,
    "carteira_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_lancamento" "TipoLancamentoCarteira" NOT NULL,
    "origem" "OrigemLancamentoCarteira" NOT NULL,
    "origem_id" UUID,
    "valor_centavos" BIGINT NOT NULL,
    "saldo_anterior_centavos" BIGINT NOT NULL,
    "saldo_posterior_centavos" BIGINT NOT NULL,
    "status" "StatusLancamentoCarteira" NOT NULL DEFAULT 'PENDENTE',
    "descricao" TEXT,
    "liberado_em" TIMESTAMPTZ(3),
    "bloqueado_em" TIMESTAMPTZ(3),
    "estornado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lancamentos_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" UUID NOT NULL,
    "usuario_pagador_id" UUID NOT NULL,
    "loja_id" UUID,
    "vendedor_id" UUID,
    "valor_total_centavos" BIGINT NOT NULL,
    "valor_pago_pix_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_pago_cartao_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_pago_saldo_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_cashback_usado_centavos" BIGINT NOT NULL DEFAULT 0,
    "metodo_principal" "MetodoPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "gateway" "GatewayPagamento" NOT NULL DEFAULT 'INTERNO',
    "gateway_pagamento_id" VARCHAR(255),
    "qr_code" TEXT,
    "copia_cola_pix" TEXT,
    "expira_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "estornado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pagamento" (
    "id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "nome_item" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unitario_centavos" BIGINT NOT NULL,
    "valor_total_centavos" BIGINT NOT NULL,
    "tipo_item" "TipoItemPagamento" NOT NULL,
    "referencia_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "itens_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composicoes_pagamento" (
    "id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "tipo_origem" "TipoOrigemPagamento" NOT NULL,
    "carteira_id" UUID,
    "valor_centavos" BIGINT NOT NULL,
    "status" "StatusPagamentoComposicao" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "composicoes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacoes_comerciais" (
    "id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "comprador_usuario_id" UUID NOT NULL,
    "loja_id" UUID,
    "lojista_id" UUID,
    "vendedor_id" UUID,
    "valor_bruto_centavos" BIGINT NOT NULL,
    "taxa_plataforma_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_liquido_lojista_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_pool_recompensas_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_empresa_centavos" BIGINT NOT NULL DEFAULT 0,
    "percentual_taxa_plataforma" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "percentual_empresa" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "percentual_pool" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "status" "StatusTransacaoComercial" NOT NULL DEFAULT 'PENDENTE',
    "validada_em" TIMESTAMPTZ(3),
    "liquidada_em" TIMESTAMPTZ(3),
    "cancelada_em" TIMESTAMPTZ(3),
    "estornada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transacoes_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebiveis" (
    "id" UUID NOT NULL,
    "transacao_comercial_id" UUID NOT NULL,
    "usuario_recebedor_id" UUID NOT NULL,
    "loja_id" UUID,
    "tipo_recebedor" "TipoRecebedor" NOT NULL,
    "valor_bruto_centavos" BIGINT NOT NULL,
    "taxa_plataforma_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_liquido_centavos" BIGINT NOT NULL,
    "status" "StatusRecebivel" NOT NULL DEFAULT 'PENDENTE',
    "disponivel_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "bloqueado_em" TIMESTAMPTZ(3),
    "motivo_bloqueio" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recebiveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recompensas" (
    "id" UUID NOT NULL,
    "transacao_comercial_id" UUID NOT NULL,
    "usuario_beneficiado_id" UUID NOT NULL,
    "tipo_recompensa" "TipoRecompensa" NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "percentual" DECIMAL(7,4),
    "status" "StatusRecompensa" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "liberado_em" TIMESTAMPTZ(3),
    "estornado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recompensas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_recompensa" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "tipo_recompensa" "TipoRecompensa" NOT NULL,
    "percentual" DECIMAL(7,4),
    "valor_fixo_centavos" BIGINT,
    "limite_maximo_centavos" BIGINT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "inicio_em" TIMESTAMPTZ(3),
    "fim_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regras_recompensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanhas_cashback" (
    "id" UUID NOT NULL,
    "loja_id" UUID,
    "nome" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "percentual_cashback" DECIMAL(7,4) NOT NULL,
    "valor_maximo_cashback_centavos" BIGINT,
    "orcamento_total_centavos" BIGINT NOT NULL,
    "orcamento_usado_centavos" BIGINT NOT NULL DEFAULT 0,
    "inicio_em" TIMESTAMPTZ(3) NOT NULL,
    "fim_em" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusCampanhaCashback" NOT NULL DEFAULT 'RASCUNHO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campanhas_cashback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saques" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "carteira_id" UUID NOT NULL,
    "conta_bancaria_id" UUID NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "taxa_saque_centavos" BIGINT NOT NULL DEFAULT 0,
    "valor_liquido_centavos" BIGINT NOT NULL,
    "status" "StatusSaque" NOT NULL DEFAULT 'SOLICITADO',
    "gateway_saque_id" VARCHAR(255),
    "solicitado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(3),
    "cancelado_em" TIMESTAMPTZ(3),
    "motivo_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxas_plataforma" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "tipo_taxa" "TipoTaxaPlataforma" NOT NULL,
    "categoria_loja_id" UUID,
    "loja_id" UUID,
    "percentual_taxa" DECIMAL(7,4),
    "valor_fixo_centavos" BIGINT,
    "percentual_empresa" DECIMAL(7,4),
    "percentual_pool_recompensas" DECIMAL(7,4),
    "status" "StatusTaxaPlataforma" NOT NULL DEFAULT 'ATIVA',
    "inicio_em" TIMESTAMPTZ(3),
    "fim_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "taxas_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_plataforma" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "tipo_conta" "TipoContaPlataforma" NOT NULL,
    "saldo_centavos" BIGINT NOT NULL DEFAULT 0,
    "status" "StatusContaPlataforma" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contas_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_plataforma" (
    "id" UUID NOT NULL,
    "conta_plataforma_id" UUID NOT NULL,
    "transacao_comercial_id" UUID,
    "tipo_lancamento" "TipoLancamentoPlataforma" NOT NULL,
    "valor_centavos" BIGINT NOT NULL,
    "descricao" TEXT,
    "status" "StatusLancamentoPlataforma" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lancamentos_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprovantes_pagamento" (
    "id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "url_comprovante" TEXT NOT NULL,
    "tipo_comprovante" "TipoComprovante" NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comprovantes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_fiscais" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "transacao_comercial_id" UUID,
    "tipo_documento" "TipoDocumentoFiscal" NOT NULL,
    "numero" VARCHAR(60),
    "serie" VARCHAR(30),
    "chave_acesso" VARCHAR(80),
    "url_pdf" TEXT,
    "status" "StatusDocumentoFiscal" NOT NULL DEFAULT 'PENDENTE',
    "emitido_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documentos_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_financeiros" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "transacao_comercial_id" UUID,
    "pagamento_id" UUID,
    "tipo_evento" "TipoEventoFinanceiro" NOT NULL,
    "descricao" TEXT,
    "dados_json" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "eventos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_telefone_key" ON "usuarios"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- CreateIndex
CREATE INDEX "usuarios_status_idx" ON "usuarios"("status");

-- CreateIndex
CREATE INDEX "usuarios_tipo_conta_idx" ON "usuarios"("tipo_conta");

-- CreateIndex
CREATE INDEX "usuarios_nivel_kyc_idx" ON "usuarios"("nivel_kyc");

-- CreateIndex
CREATE INDEX "perfis_usuario_usuario_id_idx" ON "perfis_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "perfis_usuario_perfil_idx" ON "perfis_usuario"("perfil");

-- CreateIndex
CREATE INDEX "perfis_usuario_status_idx" ON "perfis_usuario"("status");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_usuario_usuario_id_perfil_key" ON "perfis_usuario"("usuario_id", "perfil");

-- CreateIndex
CREATE INDEX "enderecos_usuario_usuario_id_idx" ON "enderecos_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "enderecos_usuario_cidade_idx" ON "enderecos_usuario"("cidade");

-- CreateIndex
CREATE INDEX "enderecos_usuario_estado_idx" ON "enderecos_usuario"("estado");

-- CreateIndex
CREATE INDEX "enderecos_usuario_principal_idx" ON "enderecos_usuario"("principal");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_usuarios_usuario_id_key" ON "kyc_usuarios"("usuario_id");

-- CreateIndex
CREATE INDEX "kyc_usuarios_usuario_id_idx" ON "kyc_usuarios"("usuario_id");

-- CreateIndex
CREATE INDEX "kyc_usuarios_cpf_idx" ON "kyc_usuarios"("cpf");

-- CreateIndex
CREATE INDEX "kyc_usuarios_cnpj_idx" ON "kyc_usuarios"("cnpj");

-- CreateIndex
CREATE INDEX "kyc_usuarios_status_idx" ON "kyc_usuarios"("status");

-- CreateIndex
CREATE INDEX "contas_bancarias_usuario_id_idx" ON "contas_bancarias"("usuario_id");

-- CreateIndex
CREATE INDEX "contas_bancarias_chave_pix_idx" ON "contas_bancarias"("chave_pix");

-- CreateIndex
CREATE INDEX "contas_bancarias_documento_titular_idx" ON "contas_bancarias"("documento_titular");

-- CreateIndex
CREATE INDEX "contas_bancarias_status_idx" ON "contas_bancarias"("status");

-- CreateIndex
CREATE INDEX "contas_bancarias_principal_idx" ON "contas_bancarias"("principal");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_convite_codigo_key" ON "codigos_convite"("codigo");

-- CreateIndex
CREATE INDEX "codigos_convite_usuario_id_idx" ON "codigos_convite"("usuario_id");

-- CreateIndex
CREATE INDEX "codigos_convite_ativo_idx" ON "codigos_convite"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "indicacoes_indicado_usuario_id_key" ON "indicacoes"("indicado_usuario_id");

-- CreateIndex
CREATE INDEX "indicacoes_indicador_usuario_id_idx" ON "indicacoes"("indicador_usuario_id");

-- CreateIndex
CREATE INDEX "indicacoes_indicado_usuario_id_idx" ON "indicacoes"("indicado_usuario_id");

-- CreateIndex
CREATE INDEX "indicacoes_codigo_convite_id_idx" ON "indicacoes"("codigo_convite_id");

-- CreateIndex
CREATE INDEX "indicacoes_tipo_indicacao_idx" ON "indicacoes"("tipo_indicacao");

-- CreateIndex
CREATE INDEX "indicacoes_status_idx" ON "indicacoes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lojistas_usuario_id_key" ON "lojistas"("usuario_id");

-- CreateIndex
CREATE INDEX "lojistas_cpf_idx" ON "lojistas"("cpf");

-- CreateIndex
CREATE INDEX "lojistas_cnpj_idx" ON "lojistas"("cnpj");

-- CreateIndex
CREATE INDEX "lojistas_status_idx" ON "lojistas"("status");

-- CreateIndex
CREATE INDEX "lojistas_status_kyc_idx" ON "lojistas"("status_kyc");

-- CreateIndex
CREATE INDEX "categorias_loja_nome_idx" ON "categorias_loja"("nome");

-- CreateIndex
CREATE INDEX "categorias_loja_status_idx" ON "categorias_loja"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lojas_slug_key" ON "lojas"("slug");

-- CreateIndex
CREATE INDEX "lojas_lojista_id_idx" ON "lojas"("lojista_id");

-- CreateIndex
CREATE INDEX "lojas_categoria_id_idx" ON "lojas"("categoria_id");

-- CreateIndex
CREATE INDEX "lojas_status_idx" ON "lojas"("status");

-- CreateIndex
CREATE INDEX "lojas_visivel_no_app_idx" ON "lojas"("visivel_no_app");

-- CreateIndex
CREATE UNIQUE INDEX "enderecos_loja_loja_id_key" ON "enderecos_loja"("loja_id");

-- CreateIndex
CREATE INDEX "enderecos_loja_loja_id_idx" ON "enderecos_loja"("loja_id");

-- CreateIndex
CREATE INDEX "enderecos_loja_cidade_idx" ON "enderecos_loja"("cidade");

-- CreateIndex
CREATE INDEX "enderecos_loja_estado_idx" ON "enderecos_loja"("estado");

-- CreateIndex
CREATE INDEX "enderecos_loja_bairro_idx" ON "enderecos_loja"("bairro");

-- CreateIndex
CREATE INDEX "usuarios_loja_loja_id_idx" ON "usuarios_loja"("loja_id");

-- CreateIndex
CREATE INDEX "usuarios_loja_usuario_id_idx" ON "usuarios_loja"("usuario_id");

-- CreateIndex
CREATE INDEX "usuarios_loja_cargo_idx" ON "usuarios_loja"("cargo");

-- CreateIndex
CREATE INDEX "usuarios_loja_status_idx" ON "usuarios_loja"("status");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_loja_loja_id_usuario_id_key" ON "usuarios_loja"("loja_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_usuario_id_key" ON "vendedores"("usuario_id");

-- CreateIndex
CREATE INDEX "vendedores_status_idx" ON "vendedores"("status");

-- CreateIndex
CREATE INDEX "vendedores_status_kyc_idx" ON "vendedores"("status_kyc");

-- CreateIndex
CREATE INDEX "vendedores_categoria_idx" ON "vendedores"("categoria");

-- CreateIndex
CREATE INDEX "servicos_vendedor_vendedor_id_idx" ON "servicos_vendedor"("vendedor_id");

-- CreateIndex
CREATE INDEX "servicos_vendedor_categoria_idx" ON "servicos_vendedor"("categoria");

-- CreateIndex
CREATE INDEX "servicos_vendedor_status_idx" ON "servicos_vendedor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_carteira_codigo_key" ON "tipos_carteira"("codigo");

-- CreateIndex
CREATE INDEX "tipos_carteira_status_idx" ON "tipos_carteira"("status");

-- CreateIndex
CREATE INDEX "carteiras_usuario_id_idx" ON "carteiras"("usuario_id");

-- CreateIndex
CREATE INDEX "carteiras_tipo_carteira_id_idx" ON "carteiras"("tipo_carteira_id");

-- CreateIndex
CREATE INDEX "carteiras_status_idx" ON "carteiras"("status");

-- CreateIndex
CREATE UNIQUE INDEX "carteiras_usuario_id_tipo_carteira_id_key" ON "carteiras"("usuario_id", "tipo_carteira_id");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_carteira_id_idx" ON "lancamentos_carteira"("carteira_id");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_usuario_id_idx" ON "lancamentos_carteira"("usuario_id");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_tipo_lancamento_idx" ON "lancamentos_carteira"("tipo_lancamento");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_origem_idx" ON "lancamentos_carteira"("origem");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_origem_id_idx" ON "lancamentos_carteira"("origem_id");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_status_idx" ON "lancamentos_carteira"("status");

-- CreateIndex
CREATE INDEX "lancamentos_carteira_criado_em_idx" ON "lancamentos_carteira"("criado_em");

-- CreateIndex
CREATE INDEX "pagamentos_usuario_pagador_id_idx" ON "pagamentos"("usuario_pagador_id");

-- CreateIndex
CREATE INDEX "pagamentos_loja_id_idx" ON "pagamentos"("loja_id");

-- CreateIndex
CREATE INDEX "pagamentos_vendedor_id_idx" ON "pagamentos"("vendedor_id");

-- CreateIndex
CREATE INDEX "pagamentos_status_idx" ON "pagamentos"("status");

-- CreateIndex
CREATE INDEX "pagamentos_gateway_idx" ON "pagamentos"("gateway");

-- CreateIndex
CREATE INDEX "pagamentos_gateway_pagamento_id_idx" ON "pagamentos"("gateway_pagamento_id");

-- CreateIndex
CREATE INDEX "pagamentos_criado_em_idx" ON "pagamentos"("criado_em");

-- CreateIndex
CREATE INDEX "itens_pagamento_pagamento_id_idx" ON "itens_pagamento"("pagamento_id");

-- CreateIndex
CREATE INDEX "itens_pagamento_tipo_item_idx" ON "itens_pagamento"("tipo_item");

-- CreateIndex
CREATE INDEX "itens_pagamento_referencia_id_idx" ON "itens_pagamento"("referencia_id");

-- CreateIndex
CREATE INDEX "composicoes_pagamento_pagamento_id_idx" ON "composicoes_pagamento"("pagamento_id");

-- CreateIndex
CREATE INDEX "composicoes_pagamento_carteira_id_idx" ON "composicoes_pagamento"("carteira_id");

-- CreateIndex
CREATE INDEX "composicoes_pagamento_tipo_origem_idx" ON "composicoes_pagamento"("tipo_origem");

-- CreateIndex
CREATE INDEX "composicoes_pagamento_status_idx" ON "composicoes_pagamento"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_comerciais_pagamento_id_key" ON "transacoes_comerciais"("pagamento_id");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_comprador_usuario_id_idx" ON "transacoes_comerciais"("comprador_usuario_id");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_loja_id_idx" ON "transacoes_comerciais"("loja_id");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_lojista_id_idx" ON "transacoes_comerciais"("lojista_id");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_vendedor_id_idx" ON "transacoes_comerciais"("vendedor_id");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_status_idx" ON "transacoes_comerciais"("status");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_criado_em_idx" ON "transacoes_comerciais"("criado_em");

-- CreateIndex
CREATE INDEX "transacoes_comerciais_liquidada_em_idx" ON "transacoes_comerciais"("liquidada_em");

-- CreateIndex
CREATE INDEX "recebiveis_transacao_comercial_id_idx" ON "recebiveis"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "recebiveis_usuario_recebedor_id_idx" ON "recebiveis"("usuario_recebedor_id");

-- CreateIndex
CREATE INDEX "recebiveis_loja_id_idx" ON "recebiveis"("loja_id");

-- CreateIndex
CREATE INDEX "recebiveis_tipo_recebedor_idx" ON "recebiveis"("tipo_recebedor");

-- CreateIndex
CREATE INDEX "recebiveis_status_idx" ON "recebiveis"("status");

-- CreateIndex
CREATE INDEX "recebiveis_disponivel_em_idx" ON "recebiveis"("disponivel_em");

-- CreateIndex
CREATE INDEX "recompensas_transacao_comercial_id_idx" ON "recompensas"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "recompensas_usuario_beneficiado_id_idx" ON "recompensas"("usuario_beneficiado_id");

-- CreateIndex
CREATE INDEX "recompensas_tipo_recompensa_idx" ON "recompensas"("tipo_recompensa");

-- CreateIndex
CREATE INDEX "recompensas_status_idx" ON "recompensas"("status");

-- CreateIndex
CREATE INDEX "recompensas_criado_em_idx" ON "recompensas"("criado_em");

-- CreateIndex
CREATE INDEX "regras_recompensa_tipo_recompensa_idx" ON "regras_recompensa"("tipo_recompensa");

-- CreateIndex
CREATE INDEX "regras_recompensa_ativo_idx" ON "regras_recompensa"("ativo");

-- CreateIndex
CREATE INDEX "regras_recompensa_inicio_em_idx" ON "regras_recompensa"("inicio_em");

-- CreateIndex
CREATE INDEX "regras_recompensa_fim_em_idx" ON "regras_recompensa"("fim_em");

-- CreateIndex
CREATE INDEX "campanhas_cashback_loja_id_idx" ON "campanhas_cashback"("loja_id");

-- CreateIndex
CREATE INDEX "campanhas_cashback_status_idx" ON "campanhas_cashback"("status");

-- CreateIndex
CREATE INDEX "campanhas_cashback_inicio_em_idx" ON "campanhas_cashback"("inicio_em");

-- CreateIndex
CREATE INDEX "campanhas_cashback_fim_em_idx" ON "campanhas_cashback"("fim_em");

-- CreateIndex
CREATE INDEX "saques_usuario_id_idx" ON "saques"("usuario_id");

-- CreateIndex
CREATE INDEX "saques_carteira_id_idx" ON "saques"("carteira_id");

-- CreateIndex
CREATE INDEX "saques_conta_bancaria_id_idx" ON "saques"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "saques_status_idx" ON "saques"("status");

-- CreateIndex
CREATE INDEX "saques_solicitado_em_idx" ON "saques"("solicitado_em");

-- CreateIndex
CREATE INDEX "taxas_plataforma_tipo_taxa_idx" ON "taxas_plataforma"("tipo_taxa");

-- CreateIndex
CREATE INDEX "taxas_plataforma_categoria_loja_id_idx" ON "taxas_plataforma"("categoria_loja_id");

-- CreateIndex
CREATE INDEX "taxas_plataforma_loja_id_idx" ON "taxas_plataforma"("loja_id");

-- CreateIndex
CREATE INDEX "taxas_plataforma_status_idx" ON "taxas_plataforma"("status");

-- CreateIndex
CREATE INDEX "taxas_plataforma_inicio_em_idx" ON "taxas_plataforma"("inicio_em");

-- CreateIndex
CREATE INDEX "taxas_plataforma_fim_em_idx" ON "taxas_plataforma"("fim_em");

-- CreateIndex
CREATE INDEX "contas_plataforma_tipo_conta_idx" ON "contas_plataforma"("tipo_conta");

-- CreateIndex
CREATE INDEX "contas_plataforma_status_idx" ON "contas_plataforma"("status");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_conta_plataforma_id_idx" ON "lancamentos_plataforma"("conta_plataforma_id");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_transacao_comercial_id_idx" ON "lancamentos_plataforma"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_tipo_lancamento_idx" ON "lancamentos_plataforma"("tipo_lancamento");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_status_idx" ON "lancamentos_plataforma"("status");

-- CreateIndex
CREATE INDEX "lancamentos_plataforma_criado_em_idx" ON "lancamentos_plataforma"("criado_em");

-- CreateIndex
CREATE INDEX "comprovantes_pagamento_pagamento_id_idx" ON "comprovantes_pagamento"("pagamento_id");

-- CreateIndex
CREATE INDEX "comprovantes_pagamento_tipo_comprovante_idx" ON "comprovantes_pagamento"("tipo_comprovante");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_fiscais_transacao_comercial_id_key" ON "documentos_fiscais"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "documentos_fiscais_loja_id_idx" ON "documentos_fiscais"("loja_id");

-- CreateIndex
CREATE INDEX "documentos_fiscais_transacao_comercial_id_idx" ON "documentos_fiscais"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "documentos_fiscais_chave_acesso_idx" ON "documentos_fiscais"("chave_acesso");

-- CreateIndex
CREATE INDEX "documentos_fiscais_status_idx" ON "documentos_fiscais"("status");

-- CreateIndex
CREATE INDEX "documentos_fiscais_emitido_em_idx" ON "documentos_fiscais"("emitido_em");

-- CreateIndex
CREATE INDEX "eventos_financeiros_usuario_id_idx" ON "eventos_financeiros"("usuario_id");

-- CreateIndex
CREATE INDEX "eventos_financeiros_transacao_comercial_id_idx" ON "eventos_financeiros"("transacao_comercial_id");

-- CreateIndex
CREATE INDEX "eventos_financeiros_pagamento_id_idx" ON "eventos_financeiros"("pagamento_id");

-- CreateIndex
CREATE INDEX "eventos_financeiros_tipo_evento_idx" ON "eventos_financeiros"("tipo_evento");

-- CreateIndex
CREATE INDEX "eventos_financeiros_criado_em_idx" ON "eventos_financeiros"("criado_em");

-- AddForeignKey
ALTER TABLE "perfis_usuario" ADD CONSTRAINT "perfis_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_usuario" ADD CONSTRAINT "enderecos_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_usuarios" ADD CONSTRAINT "kyc_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_convite" ADD CONSTRAINT "codigos_convite_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicador_usuario_id_fkey" FOREIGN KEY ("indicador_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicado_usuario_id_fkey" FOREIGN KEY ("indicado_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_codigo_convite_id_fkey" FOREIGN KEY ("codigo_convite_id") REFERENCES "codigos_convite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lojistas" ADD CONSTRAINT "lojistas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_lojista_id_fkey" FOREIGN KEY ("lojista_id") REFERENCES "lojistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_loja" ADD CONSTRAINT "enderecos_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_loja" ADD CONSTRAINT "usuarios_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_loja" ADD CONSTRAINT "usuarios_loja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicos_vendedor" ADD CONSTRAINT "servicos_vendedor_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carteiras" ADD CONSTRAINT "carteiras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carteiras" ADD CONSTRAINT "carteiras_tipo_carteira_id_fkey" FOREIGN KEY ("tipo_carteira_id") REFERENCES "tipos_carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_carteira" ADD CONSTRAINT "lancamentos_carteira_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_carteira" ADD CONSTRAINT "lancamentos_carteira_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_usuario_pagador_id_fkey" FOREIGN KEY ("usuario_pagador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pagamento" ADD CONSTRAINT "itens_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composicoes_pagamento" ADD CONSTRAINT "composicoes_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composicoes_pagamento" ADD CONSTRAINT "composicoes_pagamento_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_comprador_usuario_id_fkey" FOREIGN KEY ("comprador_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_lojista_id_fkey" FOREIGN KEY ("lojista_id") REFERENCES "lojistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_comerciais" ADD CONSTRAINT "transacoes_comerciais_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebiveis" ADD CONSTRAINT "recebiveis_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebiveis" ADD CONSTRAINT "recebiveis_usuario_recebedor_id_fkey" FOREIGN KEY ("usuario_recebedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebiveis" ADD CONSTRAINT "recebiveis_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recompensas" ADD CONSTRAINT "recompensas_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recompensas" ADD CONSTRAINT "recompensas_usuario_beneficiado_id_fkey" FOREIGN KEY ("usuario_beneficiado_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas_cashback" ADD CONSTRAINT "campanhas_cashback_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxas_plataforma" ADD CONSTRAINT "taxas_plataforma_categoria_loja_id_fkey" FOREIGN KEY ("categoria_loja_id") REFERENCES "categorias_loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxas_plataforma" ADD CONSTRAINT "taxas_plataforma_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_plataforma" ADD CONSTRAINT "lancamentos_plataforma_conta_plataforma_id_fkey" FOREIGN KEY ("conta_plataforma_id") REFERENCES "contas_plataforma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_plataforma" ADD CONSTRAINT "lancamentos_plataforma_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprovantes_pagamento" ADD CONSTRAINT "comprovantes_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_financeiros" ADD CONSTRAINT "eventos_financeiros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_financeiros" ADD CONSTRAINT "eventos_financeiros_transacao_comercial_id_fkey" FOREIGN KEY ("transacao_comercial_id") REFERENCES "transacoes_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_financeiros" ADD CONSTRAINT "eventos_financeiros_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
