import { getEffectiveSegmentFeePercent } from "../earnings/order-earnings.config.js";

function maskCpf(cpf) {
  if (!cpf) {
    return null;
  }

  return `***.***.***-${cpf.slice(-2)}`;
}

function sumWalletBalance(wallets) {
  return wallets.reduce(
    (total, wallet) =>
      total +
      Number(wallet.saldo_disponivel_centavos) +
      Number(wallet.saldo_pendente_centavos) +
      Number(wallet.saldo_bloqueado_centavos),
    0,
  );
}

export function serializeAdminUser(user, { includeSensitive = false } = {}) {
  return {
    accountType: user.tipo_conta,
    balanceCents: sumWalletBalance(user.carteiras ?? []),
    cpf: maskCpf(user.cpf),
    ...(includeSensitive ? { cpfValue: user.cpf } : {}),
    createdAt: user.criado_em.toISOString(),
    email: user.email,
    emailVerified: user.email_verificado,
    id: user.id,
    kycLevel: user.nivel_kyc,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    lastLoginAt: user.ultimo_login_em?.toISOString() ?? null,
    name: user.nome,
    phone: user.telefone,
    phoneVerified: user.telefone_verificado,
    profiles: deriveUserProfiles(user),
    status: user.status,
    wallets: (user.carteiras ?? []).map((wallet) => ({
      availableCents: Number(wallet.saldo_disponivel_centavos),
      blockedCents: Number(wallet.saldo_bloqueado_centavos),
      code: wallet.tipo_carteira?.codigo ?? null,
      name: wallet.tipo_carteira?.nome ?? "Carteira",
      pendingCents: Number(wallet.saldo_pendente_centavos),
    })),
  };
}

function deriveUserProfiles(user) {
  return [
    {
      role: "CONSUMIDOR",
      status: user.status,
    },
    ...(user.lojista && !user.lojista.excluido_em
      ? [{ role: "LOJISTA", status: user.lojista.status }]
      : []),
    ...(user.vendedor && !user.vendedor.excluido_em
      ? [{ role: "VENDEDOR", status: user.vendedor.status }]
      : []),
  ];
}

export function serializeCategory(category) {
  return {
    createdAt: category.criado_em.toISOString(),
    description: category.descricao,
    feePercent: Number(category.taxa_plataforma_percentual ?? 0),
    iconUrl: category.icone_url,
    id: category.id,
    name: category.nome,
    segmentsCount: category._count?.segmentos_venda ?? 0,
    status: category.status,
    storesCount: category._count?.lojas ?? 0,
    updatedAt: category.atualizado_em.toISOString(),
  };
}

export function serializeSalesSegment(segment) {
  const commission = {
    cashbackPercent:
      segment.percentual_cashback == null ? null : Number(segment.percentual_cashback),
    consumerReferralPercent:
      segment.percentual_indicacao_consumidor == null
        ? null
        : Number(segment.percentual_indicacao_consumidor),
    networkPercent:
      segment.percentual_rede == null ? null : Number(segment.percentual_rede),
    sellerReferralPercent:
      segment.percentual_indicacao_vendedor == null
        ? null
        : Number(segment.percentual_indicacao_vendedor),
  };

  return {
    category: segment.categoria_loja
      ? { id: segment.categoria_loja.id, name: segment.categoria_loja.nome }
      : null,
    categoryId: segment.categoria_loja_id,
    commission,
    createdAt: segment.criado_em.toISOString(),
    description: segment.descricao,
    feePercent: getEffectiveSegmentFeePercent(segment),
    iconName: segment.icone,
    id: segment.id,
    name: segment.nome,
    orderFlow: segment.negocia_pedido_por_chat
      ? "CHAT_NEGOTIATION"
      : "DIRECT_CHECKOUT",
    sellersCount: segment._count?.vendedores ?? 0,
    slug: segment.slug,
    sortOrder: segment.ordem,
    status: segment.status,
    salesCount: segment._count?.vendas_autonomas ?? 0,
    storesCount: segment._count?.lojas ?? 0,
    updatedAt: segment.atualizado_em.toISOString(),
  };
}

export function serializeAdminServiceType(type) {
  return {
    createdAt: type.criado_em.toISOString(),
    description: type.descricao,
    iconName: type.icone,
    id: type.id,
    mode: type.modo_atendimento,
    name: type.nome,
    operationalType: type.tipo_operacao,
    providersCount: type._count?.servicos_vendedor ?? 0,
    segment: type.segmento_venda
      ? { id: type.segmento_venda.id, name: type.segmento_venda.nome }
      : null,
    segmentId: type.segmento_venda_id,
    slug: type.slug,
    sortOrder: type.ordem,
    status: type.status,
    updatedAt: type.atualizado_em.toISOString(),
  };
}

export function serializeAdminStore(store) {
  const segment = store.segmento_venda ?? store.categoria?.segmento_venda ?? null;
  const categoryFeePercent = Number(store.categoria?.taxa_plataforma_percentual ?? 0);
  const segmentFeePercent = Number(segment?.taxa_plataforma_percentual ?? categoryFeePercent);
  const customFeePercent =
    store.taxa_plataforma_personalizada_percentual == null
      ? null
      : Number(store.taxa_plataforma_personalizada_percentual);

  return {
    acceptsOnlinePayment: store.aceita_pagamento_online,
    acceptsQrCode: store.aceita_qrcode,
    bannerUrl: store.banner_url,
    category: store.categoria
      ? {
          feePercent: categoryFeePercent,
          id: store.categoria.id,
          name: store.categoria.nome,
        }
      : null,
    categoryId: store.categoria_id,
    createdAt: store.criado_em.toISOString(),
    deletedAt: store.excluido_em?.toISOString() ?? null,
    description: store.descricao,
    email: store.email,
    fee: {
      categoryPercent: categoryFeePercent,
      changedAt: store.taxa_plataforma_alterada_em?.toISOString() ?? null,
      changedByAdminId: store.taxa_plataforma_alterada_por_admin_id,
      customPercent: customFeePercent,
      effectivePercent: customFeePercent ?? segmentFeePercent,
      hasCustom: customFeePercent != null,
      segmentPercent: segmentFeePercent,
    },
    id: store.id,
    logoUrl: store.logo_url,
    merchant: store.lojista
      ? {
          cnpj: store.lojista.cnpj,
          cpf: store.lojista.cpf,
          id: store.lojista.id,
          kycStatus: store.lojista.status_kyc,
          monthlySalesLimitCents:
            store.lojista.limite_faturamento_mensal_centavos == null
              ? null
              : Number(store.lojista.limite_faturamento_mensal_centavos),
          name: store.lojista.nome_fantasia,
          status: store.lojista.status,
          type: store.lojista.tipo_pessoa,
          user: store.lojista.usuario
            ? {
                email: store.lojista.usuario.email,
                id: store.lojista.usuario.id,
                name: store.lojista.usuario.nome,
                phone: store.lojista.usuario.telefone,
                status: store.lojista.usuario.status,
              }
            : null,
        }
      : null,
    name: store.nome,
    ordersCount: store._count?.pedidos ?? 0,
    phone: store.telefone,
    productsCount: store._count?.produtos ?? 0,
    segment: segment
      ? {
          id: segment.id,
          name: segment.nome,
          orderFlow: segment.negocia_pedido_por_chat
            ? "CHAT_NEGOTIATION"
            : "DIRECT_CHECKOUT",
        }
      : null,
    segmentId: store.segmento_venda_id ?? segment?.id ?? null,
    slug: store.slug,
    status: store.status,
    updatedAt: store.atualizado_em.toISOString(),
    visibleInApp: store.visivel_no_app,
    whatsapp: store.whatsapp,
  };
}
