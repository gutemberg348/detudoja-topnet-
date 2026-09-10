import { randomUUID } from "crypto";
import {
  emitOrderCreated,
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { createOrdersRepository, ordersRepository } from "./orders.repository.js";
import { parsePositiveId } from "../../utils/ids.js";
import { formatMoney } from "../../utils/money.js";
import { settleCompletedStoreOrderEarnings } from "../earnings/order-earnings.service.js";
import { assertStoreMonthlyCpfLimit } from "../earnings/commercial-limit.service.js";
import {
  releaseReservedOrderStock,
  reserveOrderStock,
} from "./order-stock.service.js";
import {
  cancelPendingAsaasOrderPayment,
  createPendingAsaasPix,
  failPendingAsaasPayment,
  shouldUseAsaasPix,
} from "../payments/asaas.service.js";
import { isAsaasEnabled } from "../payments/asaas.client.js";
import {
  allocateUserWalletsForPayment,
  debitUserWallet,
} from "../wallet/wallet.service.js";
import {
  serializeOrder,
  serializeOrderMessage,
} from "./orders.serializer.js";
import { defaultDeliveryFeeCents } from "./orders.config.js";
import { assertStoreCanReceiveOrders } from "./store-opening-hours.js";
import {
  getPaymentPolicy,
  resolvePaymentPolicy,
} from "../earnings/order-earnings.config.js";


const orderInclude = {
  _count: {
    select: {
      mensagens: {
        where: {
          lido_cliente_em: null,
          origem: { in: ["LOJA", "ADMIN"] },
        },
      },
    },
  },
  comprador: {
    select: {
      email: true,
      id: true,
      nome: true,
      telefone: true,
    },
  },
  itens: {
    orderBy: { criado_em: "asc" },
  },
  loja: {
    select: {
      id: true,
      nome: true,
    },
  },
  pagamento: true,
  propostas: {
    orderBy: { criado_em: "asc" },
  },
};

function paymentSourceForWallet(walletCode) {
  if (walletCode === "cashback") return "CASHBACK";
  if (walletCode === "saldo_pix") return "SALDO_PIX";
  return "BONUS";
}

const orderMessageInclude = {
  autor: {
    select: {
      id: true,
      nome: true,
    },
  },
};

function cents(value) {
  return Number(value ?? 0);
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);

  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function productPriceCents(product) {
  return cents(product.preco_promocional_centavos ?? product.preco_centavos);
}

function generateOrderCode() {
  return `DTJ-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .slice(0, 4)
    .toUpperCase()}`;
}

async function findIdempotentOrder(repository, userId, idempotencyKey) {
  if (!idempotencyKey) {
    return null;
  }

  return repository.findFirstOrder({
    include: orderInclude,
    where: {
      chave_idempotencia: idempotencyKey,
      usuario_id: userId,
    },
  });
}

function isIdempotencyCollision(error) {
  return error?.code === "P2002";
}

function addressSnapshot(address, reference = "") {
  if (!address) {
    return null;
  }

  return {
    bairro: address.bairro,
    cep: address.cep,
    cidade: address.cidade,
    complemento: address.complemento ?? "",
    estado: address.estado,
    numero: address.numero,
    referencia: reference || address.referencia || "",
    rua: address.rua,
  };
}

async function resolveDeliveryAddress(database, userId, data) {
  if (data.deliveryMode !== "delivery") {
    return null;
  }

  if (data.addressId) {
    const address = await createOrdersRepository(database).findAddress({
      where: {
        excluido_em: null,
        id: data.addressId,
        usuario_id: userId,
      },
    });

    if (!address) {
      throw new AppError("Endereco de entrega nao encontrado", 404);
    }

    return address;
  }

  const address = data.address;
  const addressCount = await createOrdersRepository(database).countUserAddresses({
    where: { excluido_em: null, usuario_id: userId },
  });
  const shouldBeMain = addressCount === 0;

  if (shouldBeMain) {
    await createOrdersRepository(database).updateAddresses({
      data: { principal: false },
      where: { usuario_id: userId },
    });
  }

  return createOrdersRepository(database).createUserAddress({
    data: {
      bairro: address.bairro,
      cep: formatCep(address.cep),
      cidade: address.cidade,
      complemento: address.complemento || null,
      estado: address.estado,
      nome_endereco: shouldBeMain ? "Principal" : "Entrega",
      numero: address.numero,
      principal: shouldBeMain,
      referencia: address.referencia || null,
      rua: address.rua,
      usuario_id: userId,
    },
  });
}

async function resolveStoreAndItems(storeId, requestedItems) {
  const productIds = [...new Set(requestedItems.map((item) => item.productId))];
  const store = await ordersRepository.findStore({
    include: {
      categoria: {
        select: {
          negocia_pedido_por_chat: true,
          segmento_venda: {
            select: {
              limite_cashback_prioritario_centavos: true,
              taxa_processamento_local_centavos: true,
              taxa_servico_online_centavos: true,
            },
          },
        },
      },
      segmento_venda: {
        select: {
          limite_cashback_prioritario_centavos: true,
          negocia_pedido_por_chat: true,
          taxa_processamento_local_centavos: true,
          taxa_servico_online_centavos: true,
        },
      },
      produtos: {
        where: {
          excluido_em: null,
          id: { in: productIds },
          status: "ATIVO",
        },
      },
      lojista: { select: { usuario_id: true } },
      usuarios: {
        select: { usuario_id: true },
        where: { status: "ATIVO" },
      },
    },
    where: {
      excluido_em: null,
      id: storeId,
      lojista: {
        is: {
          status: "ATIVO",
          status_kyc: "APROVADO",
          usuario: { is: { excluido_em: null, status: "ATIVO" } },
        },
      },
      status: "ATIVA",
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  try {
    assertStoreCanReceiveOrders(store);
  } catch (error) {
    throw new AppError(error.message, 409);
  }

  if (store.produtos.length !== productIds.length) {
    throw new AppError("Um ou mais produtos nao estao disponiveis", 400);
  }

  const productsById = new Map(store.produtos.map((product) => [product.id, product]));
  const items = requestedItems.map((item) => {
    const product = productsById.get(item.productId);
    const priceCents = productPriceCents(product);
    const quantity = Number(item.quantity);

    return {
      acceptsDelivery: product.aceita_entrega,
      acceptsPickup: product.aceita_retirada,
      description: product.descricao,
      name: product.nome,
      notes: item.notes || null,
      priceCents,
      productId: product.id,
      quantity,
      totalCents: priceCents * quantity,
    };
  });

  return { items, store };
}

function assertItemsSupportDeliveryMode(items, deliveryMode) {
  const incompatible = items.find((item) => (
    deliveryMode === "delivery" ? !item.acceptsDelivery : !item.acceptsPickup
  ));

  if (incompatible) {
    const mode = deliveryMode === "delivery" ? "entrega" : "retirada";
    throw new AppError(`${incompatible.name} nao aceita ${mode}`, 409);
  }
}

function assertUserCanBuyFromStore(userId, store) {
  const belongsToStore = store.lojista?.usuario_id === userId
    || store.usuarios?.some((member) => member.usuario_id === userId);

  if (belongsToStore) {
    throw new AppError(
      "Esta loja esta vinculada a sua conta. Use a cobranca presencial ou venda autonoma para registrar uma venda propria.",
      403,
    );
  }
}

export async function createOnlineOrderRequest(userId, data, { idempotencyKey = null } = {}) {
  await ordersRepository.requireUserCpf(userId);
  const { items, store } = await resolveStoreAndItems(data.storeId, data.items);
  assertUserCanBuyFromStore(userId, store);
  assertItemsSupportDeliveryMode(items, data.deliveryMode);

  const negotiatesByChat = store.segmento_venda?.negocia_pedido_por_chat
    ?? store.categoria?.negocia_pedido_por_chat
    ?? false;

  if (!negotiatesByChat) {
    throw new AppError("Esta loja usa checkout direto", 409);
  }

  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const deliveryCents = data.deliveryMode === "delivery"
    ? cents(store.taxa_entrega_centavos ?? defaultDeliveryFeeCents)
    : 0;
  const paymentPolicy = resolvePaymentPolicy({
    globalPolicy: await getPaymentPolicy(),
    store,
  });
  const serviceFeeCents = paymentPolicy.onlineServiceFeeCents;
  const totalCents = subtotalCents + deliveryCents + serviceFeeCents;

  let result;
  try {
    result = await ordersRepository.transaction(async (database) => {
    const existingOrder = await findIdempotentOrder(
      createOrdersRepository(database),
      userId,
      idempotencyKey,
    );

    if (existingOrder) {
      return { created: false, order: existingOrder };
    }

    const deliveryAddress = await resolveDeliveryAddress(database, userId, data);
    const snapshot = addressSnapshot(deliveryAddress, data.address?.referencia ?? "");
    await reserveOrderStock(database, items);

    const order = await createOrdersRepository(database).createOrder({
      data: {
        ...(idempotencyKey ? { chave_idempotencia: idempotencyKey } : {}),
        codigo: generateOrderCode(),
        endereco_entrega_id: deliveryAddress?.id ?? null,
        endereco_entrega_snapshot_json: snapshot,
        itens: {
          create: items.map((item) => ({
            descricao: item.description,
            nome_produto: item.name,
            observacao: item.notes,
            produto_id: item.productId,
            quantidade: item.quantity,
            valor_total_centavos: BigInt(item.totalCents),
            valor_unitario_centavos: BigInt(item.priceCents),
          })),
        },
        loja_id: store.id,
        mensagens: {
          create: {
            autor_usuario_id: userId,
            lido_cliente_em: new Date(),
            mensagem: `Solicitacao enviada com ${items.length} ${items.length === 1 ? "item" : "itens"}. A loja vai conferir e enviar a proposta por aqui.`,
            metadata_json: { kind: "created", status: "NEGOCIANDO" },
            origem: "CLIENTE",
            titulo: "Pedido enviado para a loja",
          },
        },
        observacao_cliente: data.address?.referencia || null,
        status: "NEGOCIANDO",
        estoque_reservado_em: new Date(),
        subtotal_centavos: BigInt(subtotalCents),
        taxa_entrega_centavos: BigInt(deliveryCents),
        taxa_servico_centavos: BigInt(serviceFeeCents),
        tipo_entrega: data.deliveryMode === "delivery" ? "ENTREGA" : "RETIRADA",
        total_centavos: BigInt(totalCents),
        usuario_id: userId,
      },
      include: orderInclude,
    });
    return { created: true, order };
  });
  } catch (error) {
    if (!idempotencyKey || !isIdempotencyCollision(error)) {
      throw error;
    }
    const order = await findIdempotentOrder(ordersRepository, userId, idempotencyKey);
    if (!order) throw error;
    result = { created: false, order };
  }

  const serializedOrder = serializeOrder(result.order);

  if (result.created) {
    emitOrderCreated(serializedOrder);
  }

  return { order: serializedOrder, reused: !result.created };
}

export async function createCheckoutOrder(userId, data, { idempotencyKey = null } = {}) {
  await ordersRepository.requireUserCpf(userId);
  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const store = await ordersRepository.findStore({
    include: {
      categoria: {
        select: {
          negocia_pedido_por_chat: true,
          segmento_venda: {
            select: {
              limite_cashback_prioritario_centavos: true,
              taxa_processamento_local_centavos: true,
              taxa_servico_online_centavos: true,
            },
          },
        },
      },
      segmento_venda: {
        select: {
          limite_cashback_prioritario_centavos: true,
          negocia_pedido_por_chat: true,
          taxa_processamento_local_centavos: true,
          taxa_servico_online_centavos: true,
        },
      },
      produtos: {
        where: {
          excluido_em: null,
          id: { in: productIds },
          status: "ATIVO",
        },
      },
      lojista: { select: { usuario_id: true } },
      usuarios: {
        select: { usuario_id: true },
        where: { status: "ATIVO" },
      },
    },
    where: {
      excluido_em: null,
      id: data.storeId,
      lojista: {
        is: {
          status: "ATIVO",
          status_kyc: "APROVADO",
          usuario: { is: { excluido_em: null, status: "ATIVO" } },
        },
      },
      status: "ATIVA",
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  try {
    assertStoreCanReceiveOrders(store);
  } catch (error) {
    throw new AppError(error.message, 409);
  }

  assertUserCanBuyFromStore(userId, store);

  const negotiatesByChat = store.segmento_venda?.negocia_pedido_por_chat
    ?? store.categoria?.negocia_pedido_por_chat
    ?? false;

  if (negotiatesByChat) {
    throw new AppError("Esta loja exige negociacao pelo chat antes do pagamento", 409);
  }

  if (store.produtos.length !== productIds.length) {
    throw new AppError("Um ou mais produtos nao estao disponiveis", 400);
  }

  const productsById = new Map(store.produtos.map((product) => [product.id, product]));
  const items = data.items.map((item) => {
    const product = productsById.get(item.productId);
    const priceCents = productPriceCents(product);
    const quantity = Number(item.quantity);

    return {
      acceptsDelivery: product.aceita_entrega,
      acceptsPickup: product.aceita_retirada,
      description: product.descricao,
      name: product.nome,
      notes: item.notes || null,
      priceCents,
      productId: product.id,
      quantity,
      totalCents: priceCents * quantity,
    };
  });
  assertItemsSupportDeliveryMode(items, data.deliveryMode);
  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const deliveryCents = data.deliveryMode === "delivery"
    ? cents(store.taxa_entrega_centavos ?? defaultDeliveryFeeCents)
    : 0;
  const paymentPolicy = resolvePaymentPolicy({
    globalPolicy: await getPaymentPolicy(),
    store,
  });
  const serviceFeeCents = paymentPolicy.onlineServiceFeeCents;
  const totalCents = subtotalCents + deliveryCents + serviceFeeCents;
  const requestedBalanceCents = data.payment?.useBalance
    ? Number(data.payment?.balanceUsedCents ?? 0)
    : 0;
  const balanceUsedCents = Math.min(Math.max(requestedBalanceCents, 0), totalCents);
  const pixComplementCents = Math.max(totalCents - balanceUsedCents, 0);
  if (balanceUsedCents > 0 && pixComplementCents > 0) {
    throw new AppError(
      "No Pix externo, escolha pagar integralmente pelas carteiras ou integralmente por Pix",
      400,
    );
  }
  if (pixComplementCents > 0 && !isAsaasEnabled()) {
    throw new AppError(
      "Pagamento Pix esta indisponivel no momento. Use suas carteiras ou tente novamente mais tarde.",
      503,
    );
  }
  const useAsaasPix = shouldUseAsaasPix({
    pixComplementCents,
    walletUsedCents: balanceUsedCents,
  });
  const method =
    balanceUsedCents > 0 && pixComplementCents > 0
      ? "MISTO"
      : balanceUsedCents > 0
        ? "SALDO_PIX"
        : "PIX";

  let result;
  try {
    result = await ordersRepository.transaction(async (database) => {
    const existingOrder = await findIdempotentOrder(
      createOrdersRepository(database),
      userId,
      idempotencyKey,
    );

    if (existingOrder) {
      return { created: false, order: existingOrder };
    }

    const deliveryAddress = await resolveDeliveryAddress(database, userId, data);
    const snapshot = addressSnapshot(deliveryAddress, data.address?.referencia ?? "");
    await reserveOrderStock(database, items);
    await assertStoreMonthlyCpfLimit(database, store.id, totalCents);
    const walletAllocations = await allocateUserWalletsForPayment({
      database,
      userId,
      valueCents: balanceUsedCents,
    });
    const payment = await createOrdersRepository(database).createPayment({
      data: {
        itens: {
          create: [
            ...items.map((item) => ({
              descricao: item.description,
              nome_item: item.name,
              quantidade: item.quantity,
              referencia_id: String(item.productId),
              tipo_item: "PRODUTO",
              valor_total_centavos: BigInt(item.totalCents),
              valor_unitario_centavos: BigInt(item.priceCents),
            })),
            ...(deliveryCents > 0
              ? [
                  {
                    nome_item: "Entrega",
                    quantidade: 1,
                    tipo_item: "TAXA",
                    valor_total_centavos: BigInt(deliveryCents),
                    valor_unitario_centavos: BigInt(deliveryCents),
                  },
                ]
              : []),
            ...(serviceFeeCents > 0
              ? [
                  {
                    nome_item: "Taxa de servico",
                    quantidade: 1,
                    tipo_item: "TAXA",
                    valor_total_centavos: BigInt(serviceFeeCents),
                    valor_unitario_centavos: BigInt(serviceFeeCents),
                  },
                ]
              : []),
          ],
        },
        gateway: useAsaasPix ? "ASAAS" : "INTERNO",
        loja_id: store.id,
        metodo_principal: method,
        pago_em: useAsaasPix ? null : new Date(),
        status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "PAGO",
        usuario_pagador_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
        valor_total_centavos: BigInt(totalCents),
      },
    });

    for (const allocation of walletAllocations) {
      await debitUserWallet({
        database,
        description: `Pagamento do pedido na loja ${store.nome}.`,
        originId: payment.id,
        userId,
        valueCents: allocation.amountCents,
        walletId: allocation.id,
      });
      await createOrdersRepository(database).createPaymentComposition({
        data: {
          carteira_id: allocation.id,
          pagamento_id: payment.id,
          status: "CONFIRMADO",
          tipo_origem: paymentSourceForWallet(allocation.code),
          valor_centavos: BigInt(allocation.amountCents),
        },
      });
    }
    if (pixComplementCents > 0) {
      await createOrdersRepository(database).createPaymentComposition({
        data: {
          pagamento_id: payment.id,
          status: useAsaasPix ? "PENDENTE" : "CONFIRMADO",
          tipo_origem: "PIX",
          valor_centavos: BigInt(pixComplementCents),
        },
      });
    }

    const order = await createOrdersRepository(database).createOrder({
      data: {
        ...(idempotencyKey ? { chave_idempotencia: idempotencyKey } : {}),
        codigo: generateOrderCode(),
        endereco_entrega_id: deliveryAddress?.id ?? null,
        endereco_entrega_snapshot_json: snapshot,
        itens: {
          create: items.map((item) => ({
            descricao: item.description,
            nome_produto: item.name,
            observacao: item.notes,
            produto_id: item.productId,
            quantidade: item.quantity,
            valor_total_centavos: BigInt(item.totalCents),
            valor_unitario_centavos: BigInt(item.priceCents),
          })),
        },
        loja_id: store.id,
        mensagens: {
          create: {
            mensagem: useAsaasPix
              ? "Pedido criado. Aguardando a confirmacao do Pix para enviar a loja."
              : "Recebemos seu pedido. A loja ja consegue acompanhar pelo painel.",
            metadata_json: {
              kind: "created",
              status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "RECEBIDO",
            },
            origem: "SISTEMA",
            titulo: useAsaasPix ? "Aguardando Pix" : "Pedido recebido",
          },
        },
        observacao_cliente: data.address?.referencia || null,
        pagamento_id: payment.id,
        status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "RECEBIDO",
        estoque_reservado_em: new Date(),
        subtotal_centavos: BigInt(subtotalCents),
        taxa_entrega_centavos: BigInt(deliveryCents),
        taxa_servico_centavos: BigInt(serviceFeeCents),
        tipo_entrega: data.deliveryMode === "delivery" ? "ENTREGA" : "RETIRADA",
        total_centavos: BigInt(totalCents),
        usuario_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
      },
      include: orderInclude,
    });
    return { created: true, order };
  });
  } catch (error) {
    if (!idempotencyKey || !isIdempotencyCollision(error)) {
      throw error;
    }
    const order = await findIdempotentOrder(ordersRepository, userId, idempotencyKey);
    if (!order) throw error;
    result = { created: false, order };
  }

  let gatewayPayment = null;

  if (useAsaasPix && result.created) {
    try {
      gatewayPayment = await createPendingAsaasPix({
        description: `Pedido ${result.order.codigo} - ${store.nome}`,
        paymentId: result.order.pagamento_id,
        userId,
      });
    } catch (error) {
      await failPendingAsaasPayment(result.order.pagamento_id);
      throw error;
    }
  }

  const serializedOrder = serializeOrder(result.order);

  if (result.created) {
    emitOrderCreated(serializedOrder);
  }

  return { gatewayPayment, order: serializedOrder, reused: !result.created };
}

export async function listCustomerOrders(userId, { storeId } = {}) {
  const parsedStoreId = storeId
    ? parsePositiveId(storeId, "Loja invalida")
    : null;
  const orders = await ordersRepository.findManyOrders({
    include: orderInclude,
    orderBy: { criado_em: "desc" },
    take: 30,
    where: {
      usuario_id: userId,
      ...(parsedStoreId ? { loja_id: parsedStoreId } : {}),
    },
  });

  return { orders: orders.map(serializeOrder) };
}

async function findCustomerOrder(userId, orderId, select = { id: true, loja_id: true, usuario_id: true }) {
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");
  const order = await ordersRepository.findFirstOrder({
    select,
    where: {
      id: parsedOrderId,
      usuario_id: userId,
    },
  });

  if (!order) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  return order;
}

export async function listCustomerOrderMessages(userId, orderId) {
  const order = await findCustomerOrder(userId, orderId);

  await ordersRepository.updateOrderMessages({
    data: { lido_cliente_em: new Date() },
    where: {
      lido_cliente_em: null,
      origem: { in: ["LOJA", "ADMIN"] },
      pedido_id: order.id,
    },
  });

  const messages = await ordersRepository.findManyOrderMessages({
    include: orderMessageInclude,
    orderBy: { criado_em: "asc" },
    where: { pedido_id: order.id },
  });

  return { messages: messages.map(serializeOrderMessage) };
}

export async function completeCustomerOrder(userId, orderId) {
  const currentOrder = await findCustomerOrder(userId, orderId, {
    id: true,
    loja_id: true,
    status: true,
    usuario_id: true,
  });

  if (currentOrder.status === "CONCLUIDO") {
    const order = await ordersRepository.findUniqueOrder({
      include: orderInclude,
      where: { id: currentOrder.id },
    });

    return { order: serializeOrder(order) };
  }

  if (currentOrder.status === "CANCELADO") {
    throw new AppError("Pedido cancelado nao pode ser concluido", 409);
  }

  if (!["SAIU_ENTREGA", "PRONTO_RETIRADA"].includes(currentOrder.status)) {
    throw new AppError("Aguarde a loja enviar ou liberar o pedido para retirada", 409);
  }

  const completedAt = new Date();
  const { message, order, settlement } = await ordersRepository.transaction(async (database) => {
    const updatedOrder = await createOrdersRepository(database).updateOrder({
      data: {
        cancelado_em: null,
        concluido_em: completedAt,
        status: "CONCLUIDO",
      },
      include: orderInclude,
      where: { id: currentOrder.id },
    });

    const createdMessage = await createOrdersRepository(database).createOrderMessage({
      data: {
        autor_usuario_id: userId,
        mensagem: "Cliente confirmou que recebeu o pedido.",
        metadata_json: {
          confirmedBy: "CLIENTE",
          kind: "status",
          status: "CONCLUIDO",
        },
        origem: "CLIENTE",
        pedido_id: currentOrder.id,
        lido_cliente_em: completedAt,
        titulo: "Pedido recebido",
      },
      include: orderMessageInclude,
    });

    const result = await settleCompletedStoreOrderEarnings(database, currentOrder.id);

    return { message: createdMessage, order: updatedOrder, settlement: result };
  });

  const serializedOrder = serializeOrder(order);
  const serializedMessage = serializeOrderMessage(message);

  emitOrderMessageCreated({
    customerId: currentOrder.usuario_id,
    message: serializedMessage,
    orderId: currentOrder.id,
    storeId: currentOrder.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);
  emitWalletUpdated({
    transactionId: settlement.transactionId,
    userIds: settlement.walletUserIds,
  });

  return { order: serializedOrder };
}

export async function cancelCustomerOrder(userId, orderId) {
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");
  const currentOrder = await ordersRepository.findFirstOrder({
    include: { pagamento: true },
    where: { id: parsedOrderId, usuario_id: userId },
  });

  if (!currentOrder) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  if (currentOrder.status === "CANCELADO") {
    const order = await ordersRepository.findUniqueOrder({
      include: orderInclude,
      where: { id: currentOrder.id },
    });
    return { order: serializeOrder(order) };
  }

  const paid = ["PAGO", "LIQUIDADO", "EM_DISPUTA", "ESTORNADO"].includes(
    currentOrder.pagamento?.status,
  );
  const started = [
    "ACEITO",
    "PREPARANDO",
    "SAIU_ENTREGA",
    "PRONTO_RETIRADA",
    "CONCLUIDO",
  ].includes(currentOrder.status);

  if (paid || started) {
    throw new AppError(
      "Pedido pago ou em atendimento: solicite o cancelamento ao suporte",
      409,
    );
  }

  if (
    currentOrder.pagamento?.gateway === "ASAAS"
    && currentOrder.pagamento.status === "AGUARDANDO_PAGAMENTO"
  ) {
    await cancelPendingAsaasOrderPayment(userId, currentOrder.id);
  } else {
    await ordersRepository.transaction(async (database) => {
      await createOrdersRepository(database).updateProposals({
        data: { status: "CANCELADA" },
        where: { pedido_id: currentOrder.id, status: { in: ["PENDENTE", "ACEITA"] } },
      });
      if (currentOrder.pagamento_id) {
        await createOrdersRepository(database).updatePayment({
          data: { cancelado_em: new Date(), status: "CANCELADO" },
          where: {
            id: currentOrder.pagamento_id,
            status: { in: ["PENDENTE", "AGUARDANDO_PAGAMENTO"] },
          },
        });
      }
      await createOrdersRepository(database).updateOrder({
        data: { cancelado_em: new Date(), status: "CANCELADO" },
        where: { id: currentOrder.id },
      });
      await releaseReservedOrderStock(database, currentOrder.id);
    });
  }

  const order = await ordersRepository.findUniqueOrder({
    include: orderInclude,
    where: { id: currentOrder.id },
  });
  const serializedOrder = serializeOrder(order);
  emitOrderStatusUpdated(serializedOrder);

  return { order: serializedOrder };
}

export async function acceptCustomerOrderProposal(userId, orderId, proposalId) {
  const order = await findCustomerOrder(userId, orderId, {
    id: true,
    loja_id: true,
    status: true,
    usuario_id: true,
  });
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");

  if (order.status !== "NEGOCIANDO") {
    throw new AppError("Este pedido nao esta aguardando uma proposta", 409);
  }

  const result = await ordersRepository.transaction(async (database) => {
    const claimedProposal = await createOrdersRepository(database).updateProposals({
      data: { respondido_em: new Date(), status: "ACEITA" },
      where: {
        id: parsedProposalId,
        pedido_id: order.id,
        status: "PENDENTE",
      },
    });

    if (claimedProposal.count !== 1) {
      throw new AppError("Esta proposta nao esta mais disponivel", 409);
    }

    const proposal = await createOrdersRepository(database).findUniqueProposal({
      where: { id: parsedProposalId },
    });
    const currentOrder = await createOrdersRepository(database).findUniqueOrder({
      select: { taxa_entrega_centavos: true, taxa_servico_centavos: true },
      where: { id: order.id },
    });
    const totalCents = Number(proposal.valor_centavos);
    const deliveryCents = Math.min(Number(currentOrder.taxa_entrega_centavos), totalCents);
    const serviceFeeCents = Math.min(
      Number(currentOrder.taxa_servico_centavos),
      Math.max(totalCents - deliveryCents, 0),
    );
    const updatedOrder = await createOrdersRepository(database).updateOrder({
      data: {
        status: "AGUARDANDO_PAGAMENTO",
        subtotal_centavos: BigInt(Math.max(totalCents - deliveryCents - serviceFeeCents, 0)),
        total_centavos: proposal.valor_centavos,
      },
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await createOrdersRepository(database).createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_cliente_em: new Date(),
        mensagem: `Proposta de ${formatMoney(proposal.valor_centavos)} aceita. O pagamento online ja pode ser concluido.`,
        metadata_json: {
          amountCents: totalCents,
          kind: "proposal-accepted",
          proposalId: proposal.id,
          status: "AGUARDANDO_PAGAMENTO",
        },
        origem: "CLIENTE",
        pedido_id: order.id,
        titulo: "Proposta aceita",
      },
      include: orderMessageInclude,
    });

    return { message, order: updatedOrder, proposal };
  });

  const serializedOrder = serializeOrder(result.order);
  const serializedMessage = serializeOrderMessage(result.message);

  emitOrderMessageCreated({
    customerId: order.usuario_id,
    message: serializedMessage,
    orderId: order.id,
    storeId: order.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return {
    message: serializedMessage,
    order: serializedOrder,
  };
}

export async function declineCustomerOrderProposal(userId, orderId, proposalId) {
  const order = await findCustomerOrder(userId, orderId);
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");

  const result = await ordersRepository.transaction(async (database) => {
    const declinedProposal = await createOrdersRepository(database).updateProposals({
      data: { respondido_em: new Date(), status: "RECUSADA" },
      where: {
        id: parsedProposalId,
        pedido_id: order.id,
        status: "PENDENTE",
      },
    });

    if (declinedProposal.count !== 1) {
      throw new AppError("Esta proposta nao esta mais disponivel", 409);
    }

    const updatedOrder = await createOrdersRepository(database).updateOrder({
      data: { status: "NEGOCIANDO" },
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await createOrdersRepository(database).createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_cliente_em: new Date(),
        mensagem: "Proposta recusada. A negociacao continua aberta no chat.",
        metadata_json: {
          kind: "proposal-declined",
          proposalId: parsedProposalId,
          status: "NEGOCIANDO",
        },
        origem: "CLIENTE",
        pedido_id: order.id,
        titulo: "Proposta recusada",
      },
      include: orderMessageInclude,
    });

    return { message, order: updatedOrder };
  });

  const serializedOrder = serializeOrder(result.order);
  const serializedMessage = serializeOrderMessage(result.message);

  emitOrderMessageCreated({
    customerId: order.usuario_id,
    message: serializedMessage,
    orderId: order.id,
    storeId: order.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return { message: serializedMessage, order: serializedOrder };
}

export async function payCustomerOrderProposal(userId, orderId, proposalId, data) {
  await ordersRepository.requireUserCpf(userId);
  const parsedOrderId = parsePositiveId(orderId, "Pedido invalido");
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");
  const currentOrder = await ordersRepository.findFirstOrder({
    include: {
      itens: { orderBy: { criado_em: "asc" } },
      propostas: true,
    },
    where: {
      id: parsedOrderId,
      usuario_id: userId,
    },
  });

  if (!currentOrder) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  if (currentOrder.pagamento_id) {
    throw new AppError("Este pedido ja foi pago", 409);
  }

  const proposal = currentOrder.propostas.find((item) => item.id === parsedProposalId);

  if (!proposal || proposal.status !== "ACEITA" || currentOrder.status !== "AGUARDANDO_PAGAMENTO") {
    throw new AppError("A proposta nao esta pronta para pagamento", 409);
  }

  const totalCents = Number(currentOrder.total_centavos);
  const serviceFeeCents = Number(currentOrder.taxa_servico_centavos ?? 0);
  const requestedBalanceCents = data.useBalance
    ? Number(data.balanceUsedCents ?? 0)
    : 0;
  const balanceUsedCents = Math.min(Math.max(requestedBalanceCents, 0), totalCents);
  const pixComplementCents = Math.max(totalCents - balanceUsedCents, 0);
  if (balanceUsedCents > 0 && pixComplementCents > 0) {
    throw new AppError(
      "No Pix externo, escolha pagar integralmente pelas carteiras ou integralmente por Pix",
      400,
    );
  }
  if (pixComplementCents > 0 && !isAsaasEnabled()) {
    throw new AppError(
      "Pagamento Pix esta indisponivel no momento. Use suas carteiras ou tente novamente mais tarde.",
      503,
    );
  }
  const useAsaasPix = shouldUseAsaasPix({
    pixComplementCents,
    walletUsedCents: balanceUsedCents,
  });
  const method =
    balanceUsedCents > 0 && pixComplementCents > 0
      ? "MISTO"
      : balanceUsedCents > 0
        ? "SALDO_PIX"
        : "PIX";
  const paymentConfirmedAt = useAsaasPix ? null : new Date();

  const result = await ordersRepository.transaction(async (database) => {
    const repository = createOrdersRepository(database);
    await repository.lockOrder(currentOrder.id);
    const lockedOrder = await repository.findUniqueOrder({
      select: { pagamento_id: true, status: true },
      where: { id: currentOrder.id },
    });
    const lockedProposal = await repository.findFirstProposal({
      where: {
        id: proposal.id,
        pedido_id: currentOrder.id,
        status: "ACEITA",
      },
    });

    if (!lockedProposal || lockedOrder?.pagamento_id || lockedOrder.status !== "AGUARDANDO_PAGAMENTO") {
      throw new AppError("Esta proposta ja foi processada", 409);
    }

    await assertStoreMonthlyCpfLimit(database, currentOrder.loja_id, totalCents);

    if (!useAsaasPix) {
      await repository.updateProposal({
        data: { pago_em: paymentConfirmedAt, status: "PAGA" },
        where: { id: lockedProposal.id },
      });
    }

    const walletAllocations = await allocateUserWalletsForPayment({
      database,
      userId,
      valueCents: balanceUsedCents,
    });
    const payment = await repository.createPayment({
      data: {
        itens: {
          create: [
            {
              descricao: proposal.descricao || "Valor confirmado pela loja no chat",
              nome_item: `Pedido ${currentOrder.codigo}`,
              quantidade: 1,
              referencia_id: String(currentOrder.id),
              tipo_item: "PRODUTO",
              valor_total_centavos: BigInt(totalCents - serviceFeeCents),
              valor_unitario_centavos: BigInt(totalCents - serviceFeeCents),
            },
            ...(serviceFeeCents > 0
              ? [{
                  nome_item: "Taxa de servico",
                  quantidade: 1,
                  tipo_item: "TAXA",
                  valor_total_centavos: BigInt(serviceFeeCents),
                  valor_unitario_centavos: BigInt(serviceFeeCents),
                }]
              : []),
          ],
        },
        gateway: useAsaasPix ? "ASAAS" : "INTERNO",
        loja_id: currentOrder.loja_id,
        metodo_principal: method,
        pago_em: paymentConfirmedAt,
        status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "PAGO",
        usuario_pagador_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
        valor_total_centavos: BigInt(totalCents),
      },
    });
    for (const allocation of walletAllocations) {
      await debitUserWallet({
        database,
        description: `Pagamento da proposta do pedido ${currentOrder.codigo}.`,
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
    if (pixComplementCents > 0) {
      await repository.createPaymentComposition({
        data: {
          pagamento_id: payment.id,
          status: useAsaasPix ? "PENDENTE" : "CONFIRMADO",
          tipo_origem: "PIX",
          valor_centavos: BigInt(pixComplementCents),
        },
      });
    }
    const updatedOrder = await repository.updateOrder({
      data: {
        pagamento_id: payment.id,
        status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "RECEBIDO",
        total_centavos: BigInt(totalCents),
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
      },
      include: orderInclude,
      where: { id: currentOrder.id },
    });
    const message = await repository.createOrderMessage({
      data: {
        autor_usuario_id: userId,
        lido_cliente_em: new Date(),
        mensagem: useAsaasPix
          ? `Proposta aceita. Aguardando a confirmacao do Pix de ${formatMoney(totalCents)}.`
          : `Pagamento de ${formatMoney(totalCents)} confirmado. Aguarde a loja aceitar o pedido para iniciar o atendimento.`,
        metadata_json: {
          kind: useAsaasPix ? "payment-pending" : "payment",
          proposalId: proposal.id,
          status: useAsaasPix ? "AGUARDANDO_PAGAMENTO" : "RECEBIDO",
        },
        origem: "CLIENTE",
        pedido_id: currentOrder.id,
        titulo: useAsaasPix ? "Aguardando Pix" : "Pagamento confirmado",
      },
      include: orderMessageInclude,
    });

    return { message, order: updatedOrder, payment };
  });

  let gatewayPayment = null;

  if (useAsaasPix) {
    try {
      gatewayPayment = await createPendingAsaasPix({
        description: `Proposta do pedido ${currentOrder.codigo}`,
        paymentId: result.payment.id,
        userId,
      });
    } catch (error) {
      await failPendingAsaasPayment(result.payment.id);
      throw error;
    }
  }

  const serializedOrder = serializeOrder(result.order);
  const serializedMessage = serializeOrderMessage(result.message);

  emitOrderMessageCreated({
    customerId: currentOrder.usuario_id,
    message: serializedMessage,
    orderId: currentOrder.id,
    storeId: currentOrder.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return { gatewayPayment, message: serializedMessage, order: serializedOrder };
}

export async function createCustomerOrderMessage(userId, orderId, data) {
  const order = await findCustomerOrder(userId, orderId);

  const message = await ordersRepository.createOrderMessage({
    data: {
      autor_usuario_id: userId,
      lido_cliente_em: new Date(),
      mensagem: data.message,
      origem: "CLIENTE",
      pedido_id: order.id,
      titulo: "Voce",
    },
    include: orderMessageInclude,
  });

  const serializedMessage = serializeOrderMessage(message);

  emitOrderMessageCreated({
    customerId: order.usuario_id,
    message: serializedMessage,
    orderId: order.id,
    storeId: order.loja_id,
  });

  return { message: serializedMessage };
}
