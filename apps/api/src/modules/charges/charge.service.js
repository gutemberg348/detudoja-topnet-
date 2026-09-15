import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import {
  emitChargeUpdated,
  emitServiceChatUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";
import { chargeRepository, createChargeRepository } from "./charge.repository.js";
import {
  getStoreCommissionDistribution,
  settlePaidAutonomousChargeEarnings,
  settlePaidStoreChargeEarnings,
} from "../earnings/order-earnings.service.js";
import {
  calculateLocalPaymentPreview,
  getOrderEarningsDistribution,
  getPaymentPolicy,
  getSegmentCommissionDistribution,
  resolvePaymentPolicy,
} from "../earnings/order-earnings.config.js";
import { releaseCommercialSettlement } from "../earnings/earnings-release.service.js";
import {
  assertSellerMonthlyCpfLimit,
  assertStoreMonthlyCpfLimit,
} from "../earnings/commercial-limit.service.js";
import {
  debitUserWallet,
  ensureUserWallets,
} from "../wallet/wallet.service.js";
import {
  requireActivePayoutAccount,
  reserveImmediatePixPayout,
  submitPendingPayout,
} from "../payouts/payout.service.js";

const QR_EXPIRATION_MINUTES = 30;

const chargeInclude = {
  loja: {
    select: {
      aceita_qrcode: true,
      categoria: { include: { segmento_venda: true } },
      id: true,
      limite_cashback_prioritario_centavos: true,
      logo_url: true,
      lojista: { select: { usuario_id: true } },
      nome: true,
      segmento_venda: true,
      status: true,
      taxa_plataforma_personalizada_percentual: true,
      taxa_processamento_local_centavos: true,
    },
  },
  pagamento: {
    select: {
      id: true,
      metodo_principal: true,
      pago_em: true,
      status: true,
      transacao_comercial: {
        select: {
          repasse_pix: {
            select: {
              motivo_falha: true,
              pago_em: true,
              status: true,
              valor_centavos: true,
            },
          },
        },
      },
      usuario_pagador: {
        select: {
          id: true,
          nome: true,
          telefone: true,
        },
      },
      valor_pago_saldo_centavos: true,
    },
  },
  proposta_servico: {
    select: {
      forma_pagamento: true,
      id: true,
      status: true,
      conversa_servico: {
        select: {
          cliente_usuario_id: true,
          id: true,
          loja_solicitante_id: true,
          segmento_venda: { select: { nome: true } },
          servico_vendedor: {
            select: {
              tipo_servico: { select: { tipo_operacao: true } },
            },
          },
        },
      },
    },
  },
  vendedor: {
    select: {
      id: true,
      nome_publico: true,
      segmento_venda: true,
      status: true,
      usuario_id: true,
    },
  },
  venda_autonoma: {
    select: {
      id: true,
      link_slug: true,
      segmento_venda: { select: { nome: true } },
      status: true,
    },
  },
};

function cents(value) {
  return Number(value ?? 0);
}

function normalizePublicCode(value) {
  const rawValue = String(value ?? "").trim();
  const matched = rawValue.match(/DTJ:C:([A-Z0-9-]{8,64})/i);

  return (matched?.[1] ?? rawValue).trim().toUpperCase();
}

function createPublicCode() {
  return `DTJ-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function qrPayload(code) {
  return `DTJ:C:${code}`;
}

function paymentSourceForWallet(code) {
  if (code === "cashback") {
    return "CASHBACK";
  }

  if (code === "saldo_pix") {
    return "SALDO_PIX";
  }

  return "BONUS";
}

function primaryPaymentMethod(allocations) {
  if (allocations.length > 1) {
    return "MISTO";
  }

  const source = paymentSourceForWallet(allocations[0]?.code);
  return source === "CASHBACK" ? "CASHBACK" : source === "SALDO_PIX" ? "SALDO_PIX" : "BONUS";
}

function serializeCharge(charge, { includeQr = false, localRewardPolicy = undefined } = {}) {
  const payout = charge.pagamento?.transacao_comercial?.repasse_pix;
  const merchant = charge.loja
    ? {
        id: charge.loja.id,
        logoUrl: charge.loja.logo_url,
        name: charge.loja.nome,
        type: "STORE",
      }
    : {
        id: charge.vendedor?.id ?? null,
        logoUrl: null,
        name: charge.vendedor?.nome_publico ?? "Vendedor Brasil Cashback",
        segment:
          charge.proposta_servico?.conversa_servico?.segmento_venda?.nome
          ?? charge.venda_autonoma?.segmento_venda?.nome
          ?? charge.vendedor?.segmento_venda?.nome
          ?? null,
        type: "SELLER",
      };

  return {
    amountCents: cents(charge.valor_centavos),
    code: charge.codigo_publico,
    createdAt: charge.criado_em.toISOString(),
    description: charge.descricao,
    expiresAt: charge.expira_em?.toISOString() ?? null,
    id: charge.id,
    localRewardPolicy,
    merchant,
    origin: charge.origem,
    paidAt: charge.paga_em?.toISOString() ?? null,
    payment: charge.pagamento
      ? {
          id: charge.pagamento.id,
          method: charge.pagamento.metodo_principal,
          paidAt: charge.pagamento.pago_em?.toISOString() ?? null,
          status: charge.pagamento.status,
          walletCents: cents(charge.pagamento.valor_pago_saldo_centavos),
        }
      : null,
    payout: payout
      ? {
          failureReason: payout.motivo_falha,
          paidAt: payout.pago_em?.toISOString() ?? null,
          status: payout.status,
          valueCents: cents(payout.valor_centavos),
        }
      : null,
    qrPayload: includeQr ? qrPayload(charge.codigo_publico) : undefined,
    saleId: charge.venda_autonoma?.id ?? null,
    serviceConversationId: charge.proposta_servico?.conversa_servico?.id ?? null,
    servicePaymentMode: charge.proposta_servico?.forma_pagamento ?? null,
    serviceProposalId: charge.proposta_servico?.id ?? null,
    status: charge.status,
    title: charge.titulo,
  };
}

function serializeGeneratedCharge(charge) {
  const serialized = serializeCharge(charge);
  const payer = charge.pagamento?.usuario_pagador;

  return {
    ...serialized,
    customer: payer
      ? {
          id: payer.id,
          name: payer.nome,
          phone: payer.telefone,
        }
      : null,
  };
}

async function createQrDataUrl(code) {
  return QRCode.toDataURL(qrPayload(code), {
    color: { dark: "#082E22", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
    margin: 1,
    width: 520,
  });
}

export async function serializeChargeWithQr(charge) {
  return {
    charge: serializeCharge(charge, {
      includeQr: true,
      localRewardPolicy: await getChargeLocalRewardPolicy(charge),
    }),
    qrImageDataUrl: await createQrDataUrl(charge.codigo_publico),
  };
}

async function getChargeLocalRewardPolicy(charge) {
  if (charge.origem !== "PRESENCIAL") return null;

  const globalPolicy = await getPaymentPolicy();
  let commission;
  let policy;

  if (charge.loja) {
    commission = (await getStoreCommissionDistribution(undefined, charge.loja)).commission;
    policy = resolvePaymentPolicy({ globalPolicy, store: charge.loja });
  } else if (charge.vendedor?.segmento_venda) {
    const globalDistribution = await getOrderEarningsDistribution();
    commission = getSegmentCommissionDistribution(
      charge.vendedor.segmento_venda,
      globalDistribution,
    );
    policy = resolvePaymentPolicy({
      globalPolicy,
      segment: charge.vendedor.segmento_venda,
    });
  } else {
    return null;
  }

  return calculateLocalPaymentPreview({
    feePercent: commission.feePercent,
    grossCents: cents(charge.valor_centavos),
    policy,
  });
}

async function loadCharge(repository, code) {
  const charge = await repository.findUniqueCharge({
    include: chargeInclude,
    where: { codigo_publico: normalizePublicCode(code) },
  });

  if (!charge) {
    throw new AppError("Cobranca nao encontrada", 404);
  }

  return charge;
}

async function expireChargeIfNeeded(repository, charge) {
  if (
    charge.proposta_servico
    && !charge.pagamento
    && ["ATIVA", "EXPIRADA"].includes(charge.status)
    && (charge.expira_em || charge.status === "EXPIRADA")
  ) {
    return repository.updateCharge({
      data: { expira_em: null, status: "ATIVA" },
      include: chargeInclude,
      where: { id: charge.id },
    });
  }

  if (charge.status === "ATIVA" && charge.expira_em && charge.expira_em <= new Date()) {
    return repository.updateCharge({
      data: { status: "EXPIRADA" },
      include: chargeInclude,
      where: { id: charge.id },
    });
  }

  return charge;
}

function generatedChargeAccessWhere(userId) {
  return {
    OR: [
      { criador_usuario_id: userId },
      {
        loja: {
          lojista: { usuario_id: userId },
        },
      },
    ],
  };
}

async function findGeneratedCharge(userId, chargeId) {
  const id = Number(chargeId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Cobranca invalida", 400);
  }

  const charge = await chargeRepository.findCharge({
    include: chargeInclude,
    where: { id, ...generatedChargeAccessWhere(userId) },
  });

  if (!charge) {
    throw new AppError("Cobranca nao encontrada para este vendedor", 404);
  }

  return expireChargeIfNeeded(chargeRepository, charge);
}

async function findAccessibleStoreForCharges(userId, storeId) {
  const id = Number(storeId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Loja invalida", 400);
  }

  const store = await chargeRepository.findStore({
    select: { id: true },
    where: {
      excluido_em: null,
      id,
      lojista: { usuario_id: userId },
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada para este vendedor", 404);
  }

  return store;
}

export async function createStoreQrCharge(userId, storeId, data) {
  await Promise.all([
    chargeRepository.requireCommercialTier2(userId),
    chargeRepository.requireUserCpf(userId),
  ]);
  const parsedStoreId = Number(storeId);
  const store = await chargeRepository.findStore({
    select: {
      aceita_qrcode: true,
      id: true,
      lojista: { select: { usuario_id: true } },
      nome: true,
    },
    where: {
      excluido_em: null,
      id: parsedStoreId,
      lojista: {
        is: {
          status: "ATIVO",
          status_kyc: "APROVADO",
          usuario: { is: commercialTier2UserWhere },
        },
      },
      status: "ATIVA",
      lojista: { usuario_id: userId },
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada para gerar a cobranca", 404);
  }

  if (!store.aceita_qrcode) {
    throw new AppError("Esta loja esta com o pagamento por QR desativado", 409);
  }

  await requireActivePayoutAccount(store.lojista.usuario_id);

  const seller = await chargeRepository.findSeller({
    select: { id: true },
    where: { usuario_id: userId },
  });
  const charge = await chargeRepository.createCharge({
    data: {
      codigo_publico: createPublicCode(),
      criador_usuario_id: userId,
      descricao: data.description || null,
      expira_em: new Date(Date.now() + QR_EXPIRATION_MINUTES * 60 * 1000),
      loja_id: store.id,
      origem: "PRESENCIAL",
      titulo: data.title || `Compra em ${store.nome}`,
      valor_centavos: BigInt(data.amountCents),
      vendedor_id: seller?.id ?? null,
    },
    include: chargeInclude,
  });

  return serializeChargeWithQr(charge);
}

export async function createAutonomousQrCharge(database, {
  amountCents,
  description,
  seller,
  title,
  saleId,
}) {
  await requireActivePayoutAccount(seller.usuario_id, database);
  return createChargeRepository(database).createCharge({
    data: {
      codigo_publico: createPublicCode(),
      criador_usuario_id: seller.usuario_id,
      descricao: description || null,
      expira_em: new Date(Date.now() + QR_EXPIRATION_MINUTES * 60 * 1000),
      origem: "AVULSA",
      titulo: title,
      valor_centavos: BigInt(amountCents),
      venda_autonoma_id: saleId,
      vendedor_id: seller.id,
    },
    include: chargeInclude,
  });
}

export async function createServiceConversationCharge(database, {
  conversation,
  description,
  paymentMode,
  proposalId,
  seller,
  serviceName,
  valueCents,
}) {
  if (paymentMode === "QR_PRESENCIAL") {
    await requireActivePayoutAccount(seller.usuario_id, database);
  }
  return createChargeRepository(database).createCharge({
    data: {
      codigo_publico: createPublicCode(),
      criador_usuario_id: seller.usuario_id,
      descricao: description || `Servico negociado na conversa #${conversation.id}`,
      expira_em: null,
      origem: paymentMode === "QR_PRESENCIAL" ? "PRESENCIAL" : "AVULSA",
      proposta_servico_id: proposalId,
      titulo: `Servico: ${serviceName}`,
      valor_centavos: BigInt(valueCents),
      vendedor_id: seller.id,
    },
    include: chargeInclude,
  });
}

export async function listGeneratedCharges(userId) {
  const charges = await chargeRepository.findCharges({
    include: chargeInclude,
    orderBy: { criado_em: "desc" },
    take: 5,
    where: generatedChargeAccessWhere(userId),
  });
  const currentCharges = await Promise.all(
    charges.map((charge) => expireChargeIfNeeded(chargeRepository, charge)),
  );

  return { charges: currentCharges.map(serializeGeneratedCharge) };
}

export async function listGeneratedChargesHistory(userId) {
  const charges = await chargeRepository.findCharges({
    include: chargeInclude,
    orderBy: { criado_em: "desc" },
    take: 100,
    where: generatedChargeAccessWhere(userId),
  });
  const currentCharges = await Promise.all(
    charges.map((charge) => expireChargeIfNeeded(chargeRepository, charge)),
  );

  return { charges: currentCharges.map(serializeGeneratedCharge) };
}

export async function listStoreGeneratedCharges(userId, storeId, query = {}) {
  const store = await findAccessibleStoreForCharges(userId, storeId);
  const requestedLimit = Number(query.limit ?? 30);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 10), 50)
    : 30;
  const requestedCursor = Number(query.cursor);
  const cursor = Number.isInteger(requestedCursor) && requestedCursor > 0
    ? requestedCursor
    : null;
  const where = { loja_id: store.id };
  await chargeRepository.updateCharges({
    data: { status: "EXPIRADA" },
    where: {
      ...where,
      expira_em: { lte: new Date() },
      status: "ATIVA",
    },
  });
  const [charges, totals, paidTotals, activeTotals] = await Promise.all([
    chargeRepository.findCharges({
      include: chargeInclude,
      orderBy: [{ criado_em: "desc" }, { id: "desc" }],
      skip: cursor ? 1 : 0,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      where,
    }),
    chargeRepository.aggregateCharges({
      _count: { _all: true },
      _sum: { valor_centavos: true },
      where,
    }),
    chargeRepository.aggregateCharges({
      _count: { _all: true },
      _sum: { valor_centavos: true },
      where: { ...where, status: "PAGA" },
    }),
    chargeRepository.aggregateCharges({
      _count: { _all: true },
      _sum: { valor_centavos: true },
      where: { ...where, status: { in: ["ATIVA", "PROCESSANDO"] } },
    }),
  ]);
  const hasMore = charges.length > limit;
  const pageCharges = hasMore ? charges.slice(0, limit) : charges;
  const currentCharges = await Promise.all(
    pageCharges.map((charge) => expireChargeIfNeeded(chargeRepository, charge)),
  );

  return {
    charges: currentCharges.map(serializeGeneratedCharge),
    nextCursor: hasMore ? pageCharges.at(-1)?.id ?? null : null,
    summary: {
      activeCents: cents(activeTotals._sum.valor_centavos),
      activeCount: activeTotals._count._all,
      paidCents: cents(paidTotals._sum.valor_centavos),
      paidCount: paidTotals._count._all,
      totalCents: cents(totals._sum.valor_centavos),
      totalCount: totals._count._all,
    },
  };
}

export async function getGeneratedChargeQr(userId, chargeId) {
  const charge = await findGeneratedCharge(userId, chargeId);

  return serializeChargeWithQr(charge);
}

export async function getChargeForCustomer(userId, rawCode) {
  let charge = await loadCharge(chargeRepository, rawCode);
  charge = await expireChargeIfNeeded(chargeRepository, charge);

  if (charge.criador_usuario_id === userId) {
    throw new AppError("Use outro usuario para ler a sua propria cobranca", 409);
  }

  return {
    charge: serializeCharge(charge, {
      localRewardPolicy: await getChargeLocalRewardPolicy(charge),
    }),
  };
}

function allocateWallets(wallets, totalCents) {
  const preferredCodes = ["cashback", "saldo_pix", "rede", "vendas"];
  const sortedWallets = [...wallets].sort(
    (left, right) => preferredCodes.indexOf(left.tipo_carteira.codigo) - preferredCodes.indexOf(right.tipo_carteira.codigo),
  );
  let remainingCents = totalCents;
  const allocations = [];

  for (const wallet of sortedWallets) {
    if (remainingCents <= 0) {
      break;
    }

    const availableCents = cents(wallet.saldo_disponivel_centavos);
    const amountCents = Math.min(availableCents, remainingCents);

    if (amountCents > 0) {
      allocations.push({
        amountCents,
        code: wallet.tipo_carteira.codigo,
        id: wallet.id,
      });
      remainingCents -= amountCents;
    }
  }

  if (remainingCents > 0) {
    throw new AppError("Saldo insuficiente para pagar esta cobranca", 409);
  }

  return allocations;
}

export async function payChargeWithWallet(userId, rawCode) {
  await chargeRepository.requireUserCpf(userId);
  const code = normalizePublicCode(rawCode);
  await chargeRepository.updateCharges({
    data: { expira_em: null, status: "ATIVA" },
    where: {
      codigo_publico: code,
      pagamento_id: null,
      proposta_servico_id: { not: null },
      status: "EXPIRADA",
    },
  });
  const result = await chargeRepository.transaction(async (database) => {
    const repository = createChargeRepository(database);
    const claimed = await repository.updateCharges({
      data: { status: "PROCESSANDO" },
      where: {
        codigo_publico: code,
        OR: [{ expira_em: null }, { expira_em: { gt: new Date() } }],
        status: "ATIVA",
      },
    });

    if (claimed.count !== 1) {
      const currentCharge = await loadCharge(database, code);

      if (currentCharge.status === "ATIVA" && currentCharge.expira_em && currentCharge.expira_em <= new Date()) {
        await repository.updateCharge({
          data: { status: "EXPIRADA" },
          where: { id: currentCharge.id },
        });
        throw new AppError("Esta cobranca expirou", 409);
      }

      throw new AppError("Esta cobranca nao esta mais disponivel para pagamento", 409);
    }

    const charge = await repository.findUniqueCharge({
      include: chargeInclude,
      where: { codigo_publico: code },
    });

    if (!charge) {
      throw new AppError("Cobranca nao encontrada", 404);
    }

    if (charge.criador_usuario_id === userId) {
      throw new AppError("Nao e possivel pagar uma cobranca criada por voce", 409);
    }

    const commercialReceiverUserId = charge.loja?.lojista?.usuario_id
      ?? charge.vendedor?.usuario_id;
    if (commercialReceiverUserId) {
      await repository.requireCommercialTier2(commercialReceiverUserId);
    }

    if (charge.loja_id) {
      await assertStoreMonthlyCpfLimit(database, charge.loja_id, charge.valor_centavos);
    } else if (charge.vendedor_id) {
      await assertSellerMonthlyCpfLimit(database, charge.vendedor_id, charge.valor_centavos);
    }

    await ensureUserWallets(userId, database);
    const wallets = await repository.findWallets({
      include: { tipo_carteira: true },
      where: {
        status: "ATIVA",
        tipo_carteira: { permite_uso_em_compra: true },
        usuario_id: userId,
      },
    });
    const allocations = allocateWallets(wallets, cents(charge.valor_centavos));
    const payment = await repository.createPayment({
      data: {
        gateway: "INTERNO",
        loja_id: charge.loja_id,
        metodo_principal: primaryPaymentMethod(allocations),
        pago_em: new Date(),
        status: "PAGO",
        usuario_pagador_id: userId,
        valor_pago_saldo_centavos: BigInt(cents(charge.valor_centavos)),
        valor_total_centavos: charge.valor_centavos,
        vendedor_id: charge.vendedor_id,
      },
    });

    for (const allocation of allocations) {
      await debitUserWallet({
        database,
        description: `Pagamento da cobranca ${charge.codigo_publico}.`,
        origin: "PAGAMENTO",
        originId: payment.id,
        userId,
        valueCents: allocation.amountCents,
        walletId: allocation.id,
      });

      await repository.createPaymentComposition({
        data: {
          carteira_id: allocation.id,
          pagamento_id: payment.id,
          status: "CONFIRMADO",
          tipo_origem: paymentSourceForWallet(allocation.code),
          valor_centavos: BigInt(allocation.amountCents),
        },
      });
    }

    const paidCharge = await repository.updateCharge({
      data: {
        paga_em: new Date(),
        pagamento_id: payment.id,
        status: "PAGA",
      },
      include: chargeInclude,
      where: { id: charge.id },
    });

    if (charge.venda_autonoma_id) {
      await repository.updateAutonomousSale({
        data: { pago_em: new Date(), status: "PAGA" },
        where: { id: charge.venda_autonoma_id },
      });
    }

    let serviceConversation = null;

    if (charge.proposta_servico_id && charge.proposta_servico?.conversa_servico) {
      const paidAt = new Date();
      await repository.updateServiceProposal({
        data: { pago_em: paidAt, status: "PAGA" },
        where: { id: charge.proposta_servico_id },
      });
      await repository.updateServiceConversation({
        data: { status: "ACORDADA" },
        where: { id: charge.proposta_servico.conversa_servico.id },
      });
      await repository.createServiceMessage({
        data: {
          conversa_servico_id: charge.proposta_servico.conversa_servico.id,
          lido_cliente_em: paidAt,
          mensagem: "Pagamento confirmado pela plataforma. O servico pode seguir.",
          origem: "SISTEMA",
        },
      });
      serviceConversation = {
        conversationId: charge.proposta_servico.conversa_servico.id,
        customerUserId: charge.proposta_servico.conversa_servico.cliente_usuario_id,
        sellerUserId: charge.vendedor?.usuario_id ?? null,
      };
    }

    const earnings = charge.loja_id
      ? await settlePaidStoreChargeEarnings(database, charge.id)
      : charge.venda_autonoma_id
        ? await settlePaidAutonomousChargeEarnings(database, charge.id)
        : null;

    const isImmediatePhysical = Boolean(
      charge.loja_id
      || charge.venda_autonoma_id,
    );
    const releaseImmediately = isImmediatePhysical;
    const release = earnings?.transactionId && releaseImmediately
      ? await releaseCommercialSettlement(database, earnings.transactionId, {
          holdMs: 0,
          reason: "imediatamente por ser uma venda presencial",
        })
      : null;
    const payout = earnings?.transactionId && releaseImmediately
      ? await reserveImmediatePixPayout(database, earnings.transactionId)
      : null;

    return {
      charge: serializeCharge(paidCharge),
      earnings,
      payout,
      release,
      serviceConversation,
      sellerUserId: charge.vendedor?.usuario_id ?? null,
      walletUserIds: [userId, ...(earnings?.walletUserIds ?? [])],
    };
  });

  emitChargeUpdated(result.charge, {
    sellerUserId: result.sellerUserId,
    storeId: result.charge.merchant.type === "STORE" ? result.charge.merchant.id : null,
  });
  emitWalletUpdated({
    transactionId: result.earnings?.transactionId ?? result.charge.payment?.id,
    userIds: result.walletUserIds,
  });

  if (result.payout?.id) {
    try {
      await submitPendingPayout(result.payout.id);
    } catch (payoutError) {
      console.error(
        `[pix-payout] Nao foi possivel enviar o repasse ${result.payout.id}`,
        payoutError,
      );
    }
  }
  if (result.serviceConversation) {
    emitServiceChatUpdated({
      ...result.serviceConversation,
      reason: "payment-confirmed",
    });
  }

  return { charge: result.charge };
}
