import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma.js";
import {
  emitOrderCreated,
  emitOrderMessageCreated,
  emitOrderStatusUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { requireUserCpf } from "../../utils/cpf-required.js";
import { settleCompletedStoreOrderEarnings } from "../earnings/order-earnings.service.js";
import {
  serializeOrder,
  serializeOrderMessage,
} from "./orders.serializer.js";
import { defaultDeliveryFeeCents } from "./orders.config.js";


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

function parsePositiveIntId(value, label = "ID invalido") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(label, 400);
  }

  return id;
}

function productPriceCents(product) {
  return cents(product.preco_promocional_centavos ?? product.preco_centavos);
}

function generateOrderCode() {
  return `DTJ-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .slice(0, 4)
    .toUpperCase()}`;
}

function formatMoney(valueCents) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(valueCents) / 100);
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
    const address = await database.enderecoUsuario.findFirst({
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
  const addressCount = await database.enderecoUsuario.count({
    where: { excluido_em: null, usuario_id: userId },
  });
  const shouldBeMain = addressCount === 0;

  if (shouldBeMain) {
    await database.enderecoUsuario.updateMany({
      data: { principal: false },
      where: { usuario_id: userId },
    });
  }

  return database.enderecoUsuario.create({
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
  const store = await prisma.loja.findFirst({
    include: {
      categoria: {
        select: { negocia_pedido_por_chat: true },
      },
      segmento_venda: {
        select: { negocia_pedido_por_chat: true },
      },
      produtos: {
        where: {
          excluido_em: null,
          id: { in: productIds },
          status: "ATIVO",
        },
      },
    },
    where: {
      excluido_em: null,
      id: storeId,
      status: "ATIVA",
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  if (!store.aberta_para_pedidos) {
    throw new AppError("Esta loja esta fechada para novos pedidos", 409);
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

export async function createOnlineOrderRequest(userId, data) {
  await requireUserCpf(prisma, userId);
  const { items, store } = await resolveStoreAndItems(data.storeId, data.items);

  const negotiatesByChat = store.segmento_venda?.negocia_pedido_por_chat
    ?? store.categoria?.negocia_pedido_por_chat
    ?? false;

  if (!negotiatesByChat) {
    throw new AppError("Esta loja usa checkout direto", 409);
  }

  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const deliveryCents = data.deliveryMode === "delivery" ? defaultDeliveryFeeCents : 0;
  const totalCents = subtotalCents + deliveryCents;

  const order = await prisma.$transaction(async (database) => {
    const deliveryAddress = await resolveDeliveryAddress(database, userId, data);
    const snapshot = addressSnapshot(deliveryAddress, data.address?.referencia ?? "");

    return database.pedidoLoja.create({
      data: {
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
        subtotal_centavos: BigInt(subtotalCents),
        taxa_entrega_centavos: BigInt(deliveryCents),
        tipo_entrega: data.deliveryMode === "delivery" ? "ENTREGA" : "RETIRADA",
        total_centavos: BigInt(totalCents),
        usuario_id: userId,
      },
      include: orderInclude,
    });
  });

  const serializedOrder = serializeOrder(order);

  emitOrderCreated(serializedOrder);

  return { order: serializedOrder };
}

export async function createCheckoutOrder(userId, data) {
  await requireUserCpf(prisma, userId);
  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const store = await prisma.loja.findFirst({
    include: {
      categoria: {
        select: { negocia_pedido_por_chat: true },
      },
      segmento_venda: {
        select: { negocia_pedido_por_chat: true },
      },
      produtos: {
        where: {
          excluido_em: null,
          id: { in: productIds },
          status: "ATIVO",
        },
      },
    },
    where: {
      excluido_em: null,
      id: data.storeId,
      status: "ATIVA",
    },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  if (!store.aberta_para_pedidos) {
    throw new AppError("Esta loja esta fechada para novos pedidos", 409);
  }

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
      description: product.descricao,
      name: product.nome,
      notes: item.notes || null,
      priceCents,
      productId: product.id,
      quantity,
      totalCents: priceCents * quantity,
    };
  });
  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const deliveryCents = data.deliveryMode === "delivery" ? defaultDeliveryFeeCents : 0;
  const totalCents = subtotalCents + deliveryCents;
  const requestedBalanceCents = data.payment?.useBalance
    ? Number(data.payment?.balanceUsedCents ?? 0)
    : 0;
  const balanceUsedCents = Math.min(Math.max(requestedBalanceCents, 0), totalCents);
  const pixComplementCents = Math.max(totalCents - balanceUsedCents, 0);
  const method =
    balanceUsedCents > 0 && pixComplementCents > 0
      ? "MISTO"
      : balanceUsedCents > 0
        ? "SALDO_PIX"
        : "PIX";

  const order = await prisma.$transaction(async (database) => {
    const deliveryAddress = await resolveDeliveryAddress(database, userId, data);
    const snapshot = addressSnapshot(deliveryAddress, data.address?.referencia ?? "");
    const payment = await database.pagamento.create({
      data: {
        composicoes: {
          create: [
            ...(balanceUsedCents > 0
              ? [
                  {
                    status: "CONFIRMADO",
                    tipo_origem: "SALDO_PIX",
                    valor_centavos: BigInt(balanceUsedCents),
                  },
                ]
              : []),
            ...(pixComplementCents > 0
              ? [
                  {
                    status: "CONFIRMADO",
                    tipo_origem: "PIX",
                    valor_centavos: BigInt(pixComplementCents),
                  },
                ]
              : []),
          ],
        },
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
          ],
        },
        gateway: "INTERNO",
        loja_id: store.id,
        metodo_principal: method,
        pago_em: new Date(),
        status: "PAGO",
        usuario_pagador_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
        valor_total_centavos: BigInt(totalCents),
      },
    });

    return database.pedidoLoja.create({
      data: {
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
            mensagem: "Recebemos seu pedido. A loja ja consegue acompanhar pelo painel.",
            metadata_json: { kind: "created", status: "RECEBIDO" },
            origem: "SISTEMA",
            titulo: "Pedido recebido",
          },
        },
        observacao_cliente: data.address?.referencia || null,
        pagamento_id: payment.id,
        status: "RECEBIDO",
        subtotal_centavos: BigInt(subtotalCents),
        taxa_entrega_centavos: BigInt(deliveryCents),
        tipo_entrega: data.deliveryMode === "delivery" ? "ENTREGA" : "RETIRADA",
        total_centavos: BigInt(totalCents),
        usuario_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
      },
      include: orderInclude,
    });
  });

  const serializedOrder = serializeOrder(order);

  emitOrderCreated(serializedOrder);

  return { order: serializedOrder };
}

export async function listCustomerOrders(userId, { storeId } = {}) {
  const parsedStoreId = storeId
    ? parsePositiveIntId(storeId, "Loja invalida")
    : null;
  const orders = await prisma.pedidoLoja.findMany({
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
  const parsedOrderId = parsePositiveIntId(orderId, "Pedido invalido");
  const order = await prisma.pedidoLoja.findFirst({
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

  await prisma.pedidoLojaMensagem.updateMany({
    data: { lido_cliente_em: new Date() },
    where: {
      lido_cliente_em: null,
      origem: { in: ["LOJA", "ADMIN"] },
      pedido_id: order.id,
    },
  });

  const messages = await prisma.pedidoLojaMensagem.findMany({
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
    const order = await prisma.pedidoLoja.findUnique({
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
  const { message, order, settlement } = await prisma.$transaction(async (database) => {
    const updatedOrder = await database.pedidoLoja.update({
      data: {
        cancelado_em: null,
        concluido_em: completedAt,
        status: "CONCLUIDO",
      },
      include: orderInclude,
      where: { id: currentOrder.id },
    });

    const createdMessage = await database.pedidoLojaMensagem.create({
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

export async function acceptCustomerOrderProposal(userId, orderId, proposalId) {
  const order = await findCustomerOrder(userId, orderId, {
    id: true,
    loja_id: true,
    status: true,
    usuario_id: true,
  });
  const parsedProposalId = parsePositiveIntId(proposalId, "Proposta invalida");

  if (order.status !== "NEGOCIANDO") {
    throw new AppError("Este pedido nao esta aguardando uma proposta", 409);
  }

  const result = await prisma.$transaction(async (database) => {
    const claimedProposal = await database.propostaPedidoLoja.updateMany({
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

    const proposal = await database.propostaPedidoLoja.findUnique({
      where: { id: parsedProposalId },
    });
    const currentOrder = await database.pedidoLoja.findUnique({
      select: { taxa_entrega_centavos: true },
      where: { id: order.id },
    });
    const totalCents = Number(proposal.valor_centavos);
    const deliveryCents = Math.min(Number(currentOrder.taxa_entrega_centavos), totalCents);
    const updatedOrder = await database.pedidoLoja.update({
      data: {
        status: "AGUARDANDO_PAGAMENTO",
        subtotal_centavos: BigInt(Math.max(totalCents - deliveryCents, 0)),
        total_centavos: proposal.valor_centavos,
      },
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await database.pedidoLojaMensagem.create({
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
  const parsedProposalId = parsePositiveIntId(proposalId, "Proposta invalida");

  const result = await prisma.$transaction(async (database) => {
    const declinedProposal = await database.propostaPedidoLoja.updateMany({
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

    const updatedOrder = await database.pedidoLoja.update({
      data: { status: "NEGOCIANDO" },
      include: orderInclude,
      where: { id: order.id },
    });
    const message = await database.pedidoLojaMensagem.create({
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
  await requireUserCpf(prisma, userId);
  const parsedOrderId = parsePositiveIntId(orderId, "Pedido invalido");
  const parsedProposalId = parsePositiveIntId(proposalId, "Proposta invalida");
  const currentOrder = await prisma.pedidoLoja.findFirst({
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

  const totalCents = Number(proposal.valor_centavos);
  const requestedBalanceCents = data.useBalance
    ? Number(data.balanceUsedCents ?? 0)
    : 0;
  const balanceUsedCents = Math.min(Math.max(requestedBalanceCents, 0), totalCents);
  const pixComplementCents = Math.max(totalCents - balanceUsedCents, 0);
  const method =
    balanceUsedCents > 0 && pixComplementCents > 0
      ? "MISTO"
      : balanceUsedCents > 0
        ? "SALDO_PIX"
        : "PIX";
  const paymentConfirmedAt = new Date();

  const result = await prisma.$transaction(async (database) => {
    const claimedProposal = await database.propostaPedidoLoja.updateMany({
      data: { pago_em: paymentConfirmedAt, status: "PAGA" },
      where: {
        id: proposal.id,
        pedido_id: currentOrder.id,
        status: "ACEITA",
      },
    });

    if (claimedProposal.count !== 1) {
      throw new AppError("Esta proposta ja foi processada", 409);
    }

    const payment = await database.pagamento.create({
      data: {
        composicoes: {
          create: [
            ...(balanceUsedCents > 0
              ? [{
                  status: "CONFIRMADO",
                  tipo_origem: "SALDO_PIX",
                  valor_centavos: BigInt(balanceUsedCents),
                }]
              : []),
            ...(pixComplementCents > 0
              ? [{
                  status: "CONFIRMADO",
                  tipo_origem: "PIX",
                  valor_centavos: BigInt(pixComplementCents),
                }]
              : []),
          ],
        },
        itens: {
          create: [{
            descricao: proposal.descricao || "Valor confirmado pela loja no chat",
            nome_item: `Pedido ${currentOrder.codigo}`,
            quantidade: 1,
            referencia_id: String(currentOrder.id),
            tipo_item: "PRODUTO",
            valor_total_centavos: BigInt(totalCents),
            valor_unitario_centavos: BigInt(totalCents),
          }],
        },
        gateway: "INTERNO",
        loja_id: currentOrder.loja_id,
        metodo_principal: method,
        pago_em: paymentConfirmedAt,
        status: "PAGO",
        usuario_pagador_id: userId,
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
        valor_total_centavos: BigInt(totalCents),
      },
    });
    const updatedOrder = await database.pedidoLoja.update({
      data: {
        aceito_em: paymentConfirmedAt,
        pagamento_id: payment.id,
        status: "ACEITO",
        total_centavos: BigInt(totalCents),
        valor_pago_pix_centavos: BigInt(pixComplementCents),
        valor_pago_saldo_centavos: BigInt(balanceUsedCents),
      },
      include: orderInclude,
      where: { id: currentOrder.id },
    });
    const message = await database.pedidoLojaMensagem.create({
      data: {
        autor_usuario_id: userId,
        lido_cliente_em: new Date(),
        mensagem: `Pagamento de ${formatMoney(totalCents)} confirmado. A loja ja confirmou o pedido e pode iniciar o preparo.`,
        metadata_json: {
          kind: "payment",
          proposalId: proposal.id,
          status: "ACEITO",
        },
        origem: "CLIENTE",
        pedido_id: currentOrder.id,
        titulo: "Pagamento confirmado",
      },
      include: orderMessageInclude,
    });

    return { message, order: updatedOrder };
  });

  const serializedOrder = serializeOrder(result.order);
  const serializedMessage = serializeOrderMessage(result.message);

  emitOrderMessageCreated({
    customerId: currentOrder.usuario_id,
    message: serializedMessage,
    orderId: currentOrder.id,
    storeId: currentOrder.loja_id,
  });
  emitOrderStatusUpdated(serializedOrder);

  return { message: serializedMessage, order: serializedOrder };
}

export async function createCustomerOrderMessage(userId, orderId, data) {
  const order = await findCustomerOrder(userId, orderId);

  const message = await prisma.pedidoLojaMensagem.create({
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
