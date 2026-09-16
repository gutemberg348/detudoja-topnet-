import { serializeChatAttachment } from "../chat-media/chat-media.service.js";

function cents(value) {
  return Number(value ?? 0);
}

function serializeAddressSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  return {
    bairro: snapshot.bairro ?? "",
    cep: snapshot.cep ?? "",
    cidade: snapshot.cidade ?? "",
    complemento: snapshot.complemento ?? "",
    estado: snapshot.estado ?? "",
    numero: snapshot.numero ?? "",
    referencia: snapshot.referencia ?? "",
    rua: snapshot.rua ?? "",
  };
}

function serializeOrderItem(item) {
  return {
    description: item.descricao,
    id: item.id,
    name: item.nome_produto,
    notes: item.observacao,
    priceCents: cents(item.valor_unitario_centavos),
    productId: item.produto_id,
    quantity: item.quantidade,
    totalCents: cents(item.valor_total_centavos),
  };
}

export function serializeOrderProposal(proposal) {
  return {
    amountCents: cents(proposal.valor_centavos),
    createdAt: proposal.criado_em.toISOString(),
    description: proposal.descricao,
    id: proposal.id,
    paidAt: proposal.pago_em?.toISOString() ?? null,
    respondedAt: proposal.respondido_em?.toISOString() ?? null,
    status: proposal.status,
  };
}

export function serializeOrder(order, { audience = "customer" } = {}) {
  const unreadMessages = Number(order._count?.mensagens ?? 0);
  const unreadCustomerMessages = audience === "customer" ? unreadMessages : 0;
  const unreadStoreMessages = audience === "store" ? unreadMessages : 0;
  const proposals = (order.propostas ?? []).map(serializeOrderProposal);

  return {
    acceptedAt: order.aceito_em?.toISOString() ?? null,
    address: serializeAddressSnapshot(order.endereco_entrega_snapshot_json),
    canceledAt: order.cancelado_em?.toISOString() ?? null,
    code: order.codigo,
    completedAt: order.concluido_em?.toISOString() ?? null,
    createdAt: order.criado_em.toISOString(),
    customer: order.comprador
      ? {
          email: order.comprador.email,
          id: order.comprador.id,
          name: order.comprador.nome,
          phone: order.comprador.telefone,
        }
      : null,
    deliveryFeeCents: cents(order.taxa_entrega_centavos),
    serviceFeeCents: cents(order.taxa_servico_centavos),
    deliveryMode: order.tipo_entrega,
    id: order.id,
    items: (order.itens ?? []).map(serializeOrderItem),
    notes: order.observacao_cliente,
    paidAt: order.pagamento?.pago_em?.toISOString() ?? null,
    payment: order.pagamento
      ? {
          balanceCents: cents(order.pagamento.valor_pago_saldo_centavos),
          id: order.pagamento.id,
          method: order.pagamento.metodo_principal,
          pixCents: cents(order.pagamento.valor_pago_pix_centavos),
          status: order.pagamento.status,
          totalCents: cents(order.pagamento.valor_total_centavos),
        }
      : null,
    preparingAt: order.preparando_em?.toISOString() ?? null,
    proposals,
    latestProposal: proposals.at(-1) ?? null,
    readyForPickupAt: order.pronto_retirada_em?.toISOString() ?? null,
    shippedAt: order.saiu_entrega_em?.toISOString() ?? null,
    status: order.status,
    store: order.loja
      ? {
          id: order.loja.id,
          name: order.loja.nome,
        }
      : null,
    storeId: order.loja_id,
    subtotalCents: cents(order.subtotal_centavos),
    totalCents: cents(order.total_centavos),
    unreadCustomerMessages,
    unreadMessagesCount: unreadMessages,
    unreadStoreMessages,
    updatedAt: order.atualizado_em.toISOString(),
  };
}

const messageKindByOrigin = {
  ADMIN: "admin",
  CLIENTE: "customer",
  LOJA: "store",
  SISTEMA: "system",
};

const messageTitleByOrigin = {
  ADMIN: "Atendimento",
  CLIENTE: "Cliente",
  LOJA: "Loja",
  SISTEMA: "Atualizacao",
};

export function serializeOrderMessage(message) {
  const kind = messageKindByOrigin[message.origem] ?? "system";

  return {
    attachment: serializeChatAttachment(message, "order", message.metadata_json?.attachment),
    author: kind,
    authorUser: message.autor
      ? {
          id: message.autor.id,
          name: message.autor.nome,
        }
      : null,
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    kind,
    metadata: message.metadata_json ?? null,
    source: message.origem,
    text: message.mensagem,
    time: message.criado_em.toISOString(),
    title: message.titulo ?? messageTitleByOrigin[message.origem] ?? "Mensagem",
  };
}
