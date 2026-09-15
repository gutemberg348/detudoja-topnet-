import { prisma } from "../../config/prisma.js";
import { recordFinancialFailure } from "../monitoring/monitoring.service.js";
import { emitWalletUpdated } from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { isValidCnpj, normalizeCnpj } from "../../utils/cnpj.js";
import { isValidCpf } from "../../utils/cpf.js";
import { sendExpoPushToUsers } from "../notifications/notifications.service.js";
import {
  createAsaasPixTransfer,
  getAsaasTransfer,
  isAsaasEnabled,
  listAsaasTransfers,
} from "../payments/asaas.client.js";
import {
  createPayoutRepository,
  payoutRepository,
} from "./payout.repository.js";

const payoutInclude = {
  conta_bancaria: true,
  recebivel: true,
  transacao_comercial: { select: { pagamento_id: true } },
};

const transferTypeByPixType = {
  ALEATORIA: "EVP",
  CNPJ: "CNPJ",
  CPF: "CPF",
  EMAIL: "EMAIL",
  TELEFONE: "PHONE",
};

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePixKey(type, value) {
  const raw = String(value ?? "").trim();

  if (type === "CPF") {
    const digits = onlyDigits(raw);
    if (digits.length !== 11) throw new AppError("Chave Pix CPF invalida", 400);
    return digits;
  }

  if (type === "CNPJ") {
    const cnpj = normalizeCnpj(raw);
    if (!isValidCnpj(cnpj)) throw new AppError("Chave Pix CNPJ invalida", 400);
    return cnpj;
  }

  if (type === "TELEFONE") {
    const digits = onlyDigits(raw).replace(/^55(?=\d{11}$)/, "");
    if (digits.length !== 11) throw new AppError("Chave Pix telefone precisa ter DDD e 11 digitos", 400);
    return digits;
  }

  if (type === "EMAIL") {
    const email = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Chave Pix e-mail invalida", 400);
    }
    return email;
  }

  const key = raw.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new AppError("Chave Pix aleatoria invalida", 400);
  }
  return key;
}

function maskPixKey(type, key) {
  if (!key) return null;
  if (type === "EMAIL") {
    const [name, domain] = key.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (type === "TELEFONE") return `(**) *****-${key.slice(-4)}`;
  if (["CPF", "CNPJ"].includes(type)) return `${"*".repeat(Math.max(key.length - 4, 0))}${key.slice(-4)}`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function serializeAccount(account) {
  if (!account) return null;
  return {
    holderName: account.nome_titular,
    id: account.id,
    keyMasked: maskPixKey(account.tipo_chave, account.chave_pix),
    keyType: account.tipo_chave,
    status: account.status,
    updatedAt: account.atualizado_em.toISOString(),
    validatedAt: account.validado_em?.toISOString() ?? null,
    validationProvider: account.provedor_validacao ?? null,
  };
}

function asaasValue(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

function asaasDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(date);
}

async function getPayoutOwner(repository, userId) {
  const user = await repository.findUser({
    include: {
      lojista: { select: { cnpj: true, cpf: true, razao_social: true } },
      vendedor: { select: { cnpj: true, cpf: true, nome_publico: true } },
    },
    where: { id: userId, excluido_em: null },
  });

  if (!user) throw new AppError("Usuario nao encontrado", 404);
  const cpf = onlyDigits(user.cpf);
  if (!isValidCpf(cpf)) {
    throw new AppError("Cadastre um CPF valido na sua conta para continuar", 428);
  }

  return {
    businesses: [
      { document: normalizeCnpj(user.lojista?.cnpj), name: user.lojista?.razao_social },
      { document: normalizeCnpj(user.vendedor?.cnpj), name: user.vendedor?.nome_publico },
    ].filter((business) => isValidCnpj(business.document)),
    cpf,
    name: user.nome,
  };
}

function payoutIdentity(owner, keyType, key) {
  if (keyType !== "CNPJ") return { document: owner.cpf, holderName: owner.name };
  const business = owner.businesses.find((item) => item.document === key);
  if (!business) {
    throw new AppError("Este CNPJ precisa estar vinculado ao seu cadastro comercial", 409);
  }
  return { document: business.document, holderName: business.name || owner.name };
}

export async function getPayoutAccount(userId) {
  const account = await payoutRepository.findBankAccount({
    where: {
      excluido_em: null,
      principal: true,
      usuario_id: userId,
    },
  });
  return { account: serializeAccount(account) };
}

export async function savePayoutAccount(userId, data) {
  const owner = await getPayoutOwner(payoutRepository, userId);
  const key = normalizePixKey(data.keyType, data.keyType === "CPF" ? owner.cpf : data.key);
  payoutIdentity(owner, data.keyType, key);

  try {
    const account = await payoutRepository.transaction(async (database) => {
      const repository = createPayoutRepository(database);
      const currentOwner = await getPayoutOwner(repository, userId);
      const currentKey = normalizePixKey(data.keyType, data.keyType === "CPF" ? currentOwner.cpf : data.key);
      const currentIdentity = payoutIdentity(currentOwner, data.keyType, currentKey);

      const accountWithKey = await repository.findBankAccountByKey({
        where: { chave_pix: currentKey },
      });

      if (accountWithKey && accountWithKey.usuario_id !== userId) {
        throw new AppError("Esta chave Pix ja esta vinculada a outra conta", 409);
      }

      await repository.updateBankAccounts({
        data: { principal: false },
        where: { principal: true, usuario_id: userId },
      });

      const current = accountWithKey ?? await repository.findBankAccount({
        orderBy: { atualizado_em: "desc" },
        where: { excluido_em: null, usuario_id: userId },
      });
      const payload = {
        chave_pix: currentKey,
        documento_titular: currentIdentity.document,
        excluido_em: null,
        nome_titular: currentIdentity.holderName,
        principal: true,
        status: "ATIVA",
        tipo_chave: data.keyType,
        provedor_validacao: "CADASTRO_DIRETO",
        validado_em: null,
      };

      return current
        ? repository.updateBankAccount({ data: payload, where: { id: current.id } })
        : repository.createBankAccount({ data: { ...payload, usuario_id: userId } });
    });

    return { account: serializeAccount(account) };
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError("Esta chave Pix ja esta cadastrada", 409);
    }
    throw error;
  }
}

export async function requireActivePayoutAccount(userId, database = prisma) {
  const account = await createPayoutRepository(database).findBankAccount({
    where: {
      chave_pix: { not: null },
      excluido_em: null,
      principal: true,
      status: "ATIVA",
      tipo_chave: { not: null },
      usuario_id: userId,
    },
  });

  if (!account) {
    throw new AppError("Cadastre sua chave Pix de recebimento antes de gerar uma venda presencial", 428);
  }
  return account;
}

async function restoreFailedPayout(payoutId, reason, nextStatus = "FALHOU") {
  const result = await payoutRepository.transaction(async (database) => {
    const repository = createPayoutRepository(database);
    const payout = await repository.findPayout({ include: payoutInclude, where: { id: payoutId } });

    if (!payout || !["PROCESSANDO", "EM_RECONCILIACAO"].includes(payout.status)) return null;

    const wallet = await repository.findWallet({
      include: { tipo_carteira: true },
      where: { tipo_carteira: { codigo: "vendas" }, usuario_id: payout.usuario_id },
    });
    if (!wallet) throw new AppError("Carteira de vendas nao encontrada para devolver o repasse", 409);

    const updatedWallet = await repository.incrementWalletBalance(wallet.id, Number(payout.valor_centavos));
    const balanceAfter = Number(updatedWallet.saldo_disponivel_centavos);
    await repository.createWalletEntry({
      data: {
        carteira_id: wallet.id,
        descricao: `Repasse Pix ${payout.referencia_externa} nao realizado. Valor devolvido a carteira.`,
        origem: "ESTORNO",
        origem_id: payout.id,
        saldo_anterior_centavos: BigInt(balanceAfter - Number(payout.valor_centavos)),
        saldo_posterior_centavos: BigInt(balanceAfter),
        status: "PROCESSADO",
        tipo_lancamento: "ESTORNO",
        usuario_id: payout.usuario_id,
        valor_centavos: payout.valor_centavos,
      },
    });
    await repository.updateReceivable({
      data: { status: "DISPONIVEL" },
      where: { id: payout.recebivel_id },
    });
    await repository.updatePayout({
      data: { falhou_em: new Date(), motivo_falha: reason, status: nextStatus },
      where: { id: payout.id },
    });
    return { transactionId: payout.transacao_comercial_id, userId: payout.usuario_id };
  });

  if (result) {
    emitWalletUpdated({ transactionId: result.transactionId, userIds: [result.userId] });
    void sendExpoPushToUsers({
      body: "O Pix nao foi concluido. O valor integral voltou para o seu saldo de vendas. Confira a chave antes de tentar novamente.",
      data: { payoutId: String(payoutId), type: "payout_failed" },
      title: "Valor devolvido ao saldo",
      userIds: [result.userId],
    });
    if (nextStatus === "FALHOU") {
      recordFinancialFailure("pix-payout", reason, {
        payoutId,
        transactionId: result.transactionId,
        walletRestored: true,
      });
    }
  }
  return result;
}

async function confirmPayout(payoutId, transfer = {}) {
  const confirmed = await payoutRepository.transaction(async (database) => {
    const repository = createPayoutRepository(database);
    const payout = await repository.findPayout({ where: { id: payoutId } });
    if (!payout || payout.status === "PAGO") return payout;
    if (!["PROCESSANDO", "EM_RECONCILIACAO"].includes(payout.status)) {
      throw new AppError("Repasse Pix nao esta em estado confirmavel", 409);
    }

    const paidAt = new Date();
    await repository.updateReceivable({
      data: { pago_em: paidAt, status: "PAGO" },
      where: { id: payout.recebivel_id },
    });
    return repository.updatePayout({
      data: {
        comprovante_url: transfer.transactionReceiptUrl ?? payout.comprovante_url,
        gateway_transferencia_id: transfer.id ?? payout.gateway_transferencia_id,
        motivo_falha: null,
        pago_em: paidAt,
        status: "PAGO",
      },
      where: { id: payout.id },
    });
  });

  if (confirmed) {
    emitWalletUpdated({
      transactionId: confirmed.transacao_comercial_id,
      userIds: [confirmed.usuario_id],
    });
  }
  return confirmed;
}

export async function submitPendingPayout(payoutId) {
  const claimed = await payoutRepository.updatePayouts({
    data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
    where: { id: payoutId, status: "PENDENTE" },
  });
  if (claimed.count !== 1) return null;

  const payout = await payoutRepository.findPayout({ include: payoutInclude, where: { id: payoutId } });

  try {
    const transfer = await createAsaasPixTransfer({
      description: `Repasse presencial Brasil Cashback ${payout.referencia_externa}`,
      externalReference: payout.referencia_externa,
      operationType: "PIX",
      pixAddressKey: payout.chave_pix_destino,
      pixAddressKeyType: transferTypeByPixType[payout.tipo_chave],
      value: asaasValue(payout.valor_centavos),
    });
    const status = String(transfer.status ?? "PENDING").toUpperCase();

    await payoutRepository.updatePayout({
      data: {
        enviado_em: new Date(),
        gateway_transferencia_id: transfer.id,
        status: "PROCESSANDO",
      },
      where: { id: payout.id },
    });

    return status === "DONE" ? confirmPayout(payout.id, transfer) : transfer;
  } catch (error) {
    if (error.providerStateUnknown) {
      await payoutRepository.updatePayout({
        data: { motivo_falha: error.message, status: "EM_RECONCILIACAO" },
        where: { id: payout.id },
      });
      return null;
    }

    await restoreFailedPayout(payout.id, error.message);
    return null;
  }
}

async function findUnknownPayoutTransfer(payout) {
  const date = asaasDate(payout.enviado_em ?? payout.solicitado_em);

  for (let offset = 0; offset < 1_000; offset += 100) {
    const response = await listAsaasTransfers({
      "dateCreated[ge]": date,
      "dateCreated[le]": date,
      limit: 100,
      offset,
    });
    const transfer = response?.data?.find(
      (item) => item.externalReference === payout.referencia_externa,
    );
    if (transfer) return transfer;
    if (!response?.hasMore) return null;
  }

  return null;
}

export async function reconcilePayout(payoutId) {
  const payout = await payoutRepository.findPayout({
    where: { id: payoutId },
  });
  if (
    !payout
    || !["PROCESSANDO", "EM_RECONCILIACAO"].includes(payout.status)
  ) {
    return null;
  }

  await payoutRepository.updatePayout({
    data: { tentativas: { increment: 1 } },
    where: { id: payout.id },
  });

  try {
    const transfer = payout.gateway_transferencia_id
      ? await getAsaasTransfer(payout.gateway_transferencia_id)
      : await findUnknownPayoutTransfer(payout);
    if (!transfer) return null;

    if (!payout.gateway_transferencia_id) {
      await payoutRepository.updatePayout({
        data: {
          enviado_em: payout.enviado_em ?? new Date(),
          gateway_transferencia_id: transfer.id,
        },
        where: { id: payout.id },
      });
    }
    const status = String(transfer.status ?? "PENDING").toUpperCase();

    if (status === "DONE") return confirmPayout(payout.id, transfer);
    if (["FAILED", "CANCELLED"].includes(status)) {
      return restoreFailedPayout(
        payout.id,
        transfer.failReason ?? "Transferencia nao concluida",
        status === "CANCELLED" ? "CANCELADO" : "FALHOU",
      );
    }

    if (payout.status === "EM_RECONCILIACAO") {
      await payoutRepository.updatePayout({
        data: { motivo_falha: null, status: "PROCESSANDO" },
        where: { id: payout.id },
      });
    }
    return transfer;
  } catch (error) {
    await payoutRepository.updatePayout({
      data: { motivo_falha: error.message, status: "EM_RECONCILIACAO" },
      where: { id: payout.id },
    });
    return null;
  }
}

export async function reserveImmediatePixPayout(database, transactionId) {
  const repository = createPayoutRepository(database);
  const transaction = await repository.findCommercialTransaction({
      include: {
        lojista: { select: { usuario_id: true } },
        pagamento: {
          include: {
            cobranca: {
              select: {
                origem: true,
                proposta_servico: { select: { forma_pagamento: true } },
                venda_autonoma_id: true,
              },
            },
          },
        },
        recebiveis: { where: { tipo_recebedor: { in: ["LOJISTA", "VENDEDOR"] } } },
        repasse_pix: true,
        vendedor: { select: { usuario_id: true } },
      },
      where: { id: transactionId },
  });

  const charge = transaction?.pagamento.cobranca;
  const isImmediatePhysical = Boolean(
    charge
    && (
      charge.origem === "PRESENCIAL"
      || charge.venda_autonoma_id
      || charge.proposta_servico?.forma_pagamento === "QR_PRESENCIAL"
    ),
  );
  if (!transaction || !isImmediatePhysical) return null;
  if (transaction.repasse_pix) return transaction.repasse_pix;
  if (transaction.status !== "LIQUIDADA") throw new AppError("Venda presencial ainda nao foi liquidada", 409);

  const receivable = transaction.recebiveis[0];
  const userId = transaction.lojista?.usuario_id ?? transaction.vendedor?.usuario_id;
  if (!receivable || !userId) throw new AppError("Recebedor da venda presencial nao encontrado", 409);
  const account = await requireActivePayoutAccount(userId, database);
  const wallet = await repository.findWallet({
      include: { tipo_carteira: true },
      where: { status: "ATIVA", tipo_carteira: { codigo: "vendas" }, usuario_id: userId },
  });
  if (!wallet) throw new AppError("Carteira de vendas nao encontrada", 409);

  const created = await repository.createPayout({
      data: {
        chave_pix_destino: account.chave_pix,
        conta_bancaria_id: account.id,
        documento_titular: account.documento_titular,
        nome_titular: account.nome_titular,
        recebivel_id: receivable.id,
        referencia_externa: `DTJ-REPASSE-${transaction.id}`,
        tipo_chave: account.tipo_chave,
        transacao_comercial_id: transaction.id,
        usuario_id: userId,
        valor_centavos: receivable.valor_liquido_centavos,
      },
  });
  const amount = Number(receivable.valor_liquido_centavos);
  const reserved = await repository.decrementWalletBalance(wallet.id, amount);
  if (reserved.count !== 1) throw new AppError("Saldo da venda indisponivel para o repasse Pix", 409);
  const balanceAfter = Number(wallet.saldo_disponivel_centavos) - amount;
  await repository.createWalletEntry({
      data: {
        carteira_id: wallet.id,
        descricao: `Repasse Pix imediato da venda presencial ${created.referencia_externa}.`,
        origem: "SAQUE",
        origem_id: created.id,
        saldo_anterior_centavos: wallet.saldo_disponivel_centavos,
        saldo_posterior_centavos: BigInt(balanceAfter),
        status: "PROCESSADO",
        tipo_lancamento: "DEBITO",
        usuario_id: userId,
        valor_centavos: receivable.valor_liquido_centavos,
      },
  });
  await repository.updateReceivable({
    data: { status: "AGUARDANDO_LIQUIDACAO" },
    where: { id: receivable.id },
  });
  return created;
}

export async function queueImmediatePixPayout(transactionId) {
  const payout = await payoutRepository.transaction((database) => (
    reserveImmediatePixPayout(database, transactionId)
  ));

  if (!payout) return null;
  emitWalletUpdated({ transactionId, userIds: [payout.usuario_id] });
  if (!isAsaasEnabled()) {
    await payoutRepository.updatePayouts({ data: { status: "PROCESSANDO" }, where: { id: payout.id, status: "PENDENTE" } });
    await restoreFailedPayout(payout.id, "Gateway Asaas nao esta habilitado");
    return payout;
  }
  await submitPendingPayout(payout.id);
  return payout;
}

export async function processAsaasTransferWebhook(payload) {
  const eventId = String(payload?.id ?? "").trim();
  const event = String(payload?.event ?? "").trim().toUpperCase();
  const transferId = String(payload?.transfer?.id ?? "").trim();
  const externalReference = String(payload?.transfer?.externalReference ?? "").trim();
  if (!eventId || !event || !transferId) throw new AppError("Evento de transferencia Asaas invalido", 400);

  const outcome = await payoutRepository.transaction(async (database) => {
    const repository = createPayoutRepository(database);
    const payout = await repository.findPayoutByTransfer({ where: { gateway_transferencia_id: transferId } })
      ?? (externalReference
        ? await repository.findPayoutByReference({ where: { referencia_externa: externalReference } })
        : null);
    const gatewayEvent = await repository.upsertGatewayEvent({
      create: {
        gateway: "ASAAS",
        gateway_evento_id: eventId,
        payload_json: payload,
        tipo_evento: event,
      },
      update: {},
      where: { gateway_evento_id: eventId },
    });

    return {
      duplicate: Boolean(gatewayEvent.processado_em),
      payout: gatewayEvent.processado_em ? null : payout,
    };
  });

  if (outcome.duplicate) return { duplicate: true, processed: true };

  try {
    if (outcome.payout && event === "TRANSFER_DONE") {
      await confirmPayout(outcome.payout.id, payload.transfer);
    }
    if (outcome.payout && ["TRANSFER_FAILED", "TRANSFER_CANCELLED"].includes(event)) {
      await restoreFailedPayout(
        outcome.payout.id,
        payload.transfer?.failReason ?? "Transferencia nao concluida",
        event === "TRANSFER_CANCELLED" ? "CANCELADO" : "FALHOU",
      );
    }
    await payoutRepository.updateGatewayEvent({
      data: { erro_processamento: null, processado_em: new Date() },
      where: { gateway_evento_id: eventId },
    });
  } catch (error) {
    await payoutRepository.updateGatewayEvent({
      data: { erro_processamento: error.message },
      where: { gateway_evento_id: eventId },
    });
    throw error;
  }
  return { duplicate: false, processed: true };
}

export async function processPendingPayouts({ batchSize = 25 } = {}) {
  if (!isAsaasEnabled()) return { processed: 0 };
  const reconcileBefore = new Date(Date.now() - 30_000);
  const [pending, processing] = await Promise.all([
    payoutRepository.findPendingPayouts({
      orderBy: { solicitado_em: "asc" },
      select: { id: true },
      take: batchSize,
      where: { status: "PENDENTE" },
    }),
    payoutRepository.findPendingPayouts({
      orderBy: { atualizado_em: "asc" },
      select: { id: true },
      take: batchSize,
      where: {
        atualizado_em: { lte: reconcileBefore },
        status: { in: ["PROCESSANDO", "EM_RECONCILIACAO"] },
      },
    }),
  ]);
  for (const payout of pending) await submitPendingPayout(payout.id);
  for (const payout of processing) await reconcilePayout(payout.id);
  return { processed: pending.length, reconciled: processing.length };
}
