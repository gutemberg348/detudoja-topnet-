import { AppError } from "../../utils/errors.js";
import { createCommercialLimitRepository } from "./commercial-limit.repository.js";

const individualMonthlyLimitCents = 500000;
const paidStatuses = ["PAGO", "LIQUIDADO", "EM_DISPUTA"];

function monthStart() {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function effectiveLimitCents(entity) {
  if (!entity || entity.tipo_pessoa !== "FISICA") {
    return null;
  }

  return Number(entity.limite_faturamento_mensal_centavos ?? individualMonthlyLimitCents);
}

function individualCpfPaymentWhere(userId, excludePaymentId = null) {
  return {
    ...(excludePaymentId ? { id: { not: Number(excludePaymentId) } } : {}),
    OR: [
      { loja: { lojista: { tipo_pessoa: "FISICA", usuario_id: userId } } },
      { vendedor: { tipo_pessoa: "FISICA", usuario_id: userId } },
    ],
  };
}

async function assertLimit(repository, { amountCents, entity, paymentWhere, lockId }) {
  const limitCents = effectiveLimitCents(entity);

  if (!limitCents) {
    return;
  }

  await repository.lockCommercialEntity(lockId);
  const totals = await repository.sumPaidSince(
    paymentWhere,
    paidStatuses,
    monthStart(),
  );
  const currentCents = Number(totals._sum.valor_total_centavos ?? 0);

  if (currentCents + Number(amountCents) > limitCents) {
    throw new AppError(
      "O limite mensal de R$ 5.000,00 para vendas com CPF foi atingido",
      409,
    );
  }
}

export async function assertStoreMonthlyCpfLimit(
  database,
  storeId,
  amountCents,
  { excludePaymentId = null } = {},
) {
  const repository = createCommercialLimitRepository(database);
  const store = await repository.findStore(storeId);

  if (!store?.lojista) {
    throw new AppError("Lojista da loja nao encontrado", 409);
  }

  await assertLimit(repository, {
    amountCents,
    entity: store.lojista,
    lockId: store.lojista.id,
    paymentWhere: individualCpfPaymentWhere(store.lojista.usuario_id, excludePaymentId),
  });
}

export async function assertSellerMonthlyCpfLimit(
  database,
  sellerId,
  amountCents,
  { excludePaymentId = null } = {},
) {
  const repository = createCommercialLimitRepository(database);
  const seller = await repository.findSeller(sellerId);

  if (!seller) {
    throw new AppError("Vendedor nao encontrado", 404);
  }

  await assertLimit(repository, {
    amountCents,
    entity: seller,
    lockId: seller.id,
    paymentWhere: individualCpfPaymentWhere(seller.usuario_id, excludePaymentId),
  });
}

export async function assertPaymentMonthlyCpfLimit(database, paymentId) {
  const repository = createCommercialLimitRepository(database);
  const payment = await repository.findPayment(paymentId);

  if (!payment) {
    throw new AppError("Pagamento nao encontrado", 404);
  }

  if (payment.loja_id) {
    await assertStoreMonthlyCpfLimit(
      database,
      payment.loja_id,
      payment.valor_total_centavos,
      { excludePaymentId: payment.id },
    );
    return;
  }

  if (payment.vendedor_id) {
    await assertSellerMonthlyCpfLimit(
      database,
      payment.vendedor_id,
      payment.valor_total_centavos,
      { excludePaymentId: payment.id },
    );
  }
}
