import { prisma } from "../../config/prisma.js";
import {
  emitServiceAvailabilityUpdated,
  emitServiceChatCreated,
  emitServiceChatMessageCreated,
  emitServiceChatUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { cityAddressWhere, requireUserBaseAddress, sameCity } from "../../utils/location.js";
import { formatMoney } from "../../utils/money.js";
import {
  createServiceConversationCharge,
  serializeChargeWithQr,
} from "../charges/charge.service.js";
import {
  deleteUploadedImage,
  saveUploadedImage,
} from "../uploads/image.service.js";

const publicSellerStatuses = ["ATIVO", "PENDENTE"];
const legacyServiceTypeSlugs = ["entregador"];

function matchesStoreCity(courier, address) {
  return sameCity(
    { city: courier?.cidade_base, state: courier?.estado_base },
    address,
  );
}

async function findStoreForCourierRequest(userId, storeId) {
  const store = await prisma.loja.findFirst({
    select: {
      endereco: { select: { cidade: true, estado: true } },
      id: true,
      nome: true,
    },
    where: {
      excluido_em: null,
      id: parsePositiveId(storeId, "Loja solicitante invalida"),
      OR: [
        { lojista: { excluido_em: null, usuario_id: userId } },
        { usuarios: { some: { status: "ATIVO", usuario_id: userId } } },
      ],
    },
  });

  if (!store) throw new AppError("Voce nao possui acesso a esta loja", 403);
  if (!store.endereco) {
    throw new AppError("Cadastre o CEP e endereco comercial antes de chamar um motoboy", 428);
  }

  return store;
}

const conversationInclude = {
  cliente: { select: { foto_url: true, id: true, nome: true } },
  loja_solicitante: { select: { id: true, logo_url: true, nome: true } },
  pedido_loja: { select: { codigo: true, id: true } },
  mensagens: { orderBy: { criado_em: "asc" } },
  propostas: {
    include: {
      cobranca: {
        include: {
          pagamento: {
            select: {
              id: true,
              metodo_principal: true,
              pago_em: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { criado_em: "asc" },
  },
  segmento_venda: { select: { icone: true, id: true, nome: true, slug: true } },
  servico_vendedor: {
    include: {
      tipo_servico: { select: { icone: true, id: true, modo_atendimento: true, nome: true, slug: true, tipo_operacao: true } },
    },
  },
  vendedor: {
    include: {
      motoboy: true,
      usuario: { select: { foto_url: true, id: true, nome: true } },
    },
  },
};

function serializeSeller(seller, { isOnline = false } = {}) {
  return {
    courierProfile: seller.motoboy
      ? {
          baseCity: seller.motoboy.cidade_base,
          baseState: seller.motoboy.estado_base,
          color: seller.motoboy.cor_moto,
          displayName: seller.motoboy.nome_exibicao,
          plate: seller.motoboy.placa,
          rating: Number(seller.motoboy.avaliacao_media ?? 0),
          serviceRadiusKm: seller.motoboy.raio_atendimento_km,
          status: seller.motoboy.status,
          totalDeliveries: seller.motoboy.total_entregas,
          vehicleModel: seller.motoboy.modelo_moto,
        }
      : null,
    description: seller.descricao,
    id: seller.id,
    isOnline,
    name: seller.nome_publico,
    photoUrl: seller.usuario?.foto_url ?? null,
    rating: Number(seller.avaliacao_media ?? 0),
    userId: seller.usuario_id,
  };
}

function serializeMessage(message, viewerId) {
  const kind = message.origem === "CLIENTE" ? "customer" : message.origem === "VENDEDOR" ? "seller" : "system";
  return {
    author: kind,
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    imageUrl: message.imagem_url,
    isMine: message.autor_usuario_id === viewerId,
    text: message.mensagem,
  };
}

function serializeProposal(proposal) {
  const charge = proposal.cobranca;
  // Propostas de servico nao vencem. Mantem conversas antigas utilizaveis
  // enquanto a leitura da conversa normaliza o registro persistido.
  const isLegacyUnpaidServiceCharge = charge?.status === "EXPIRADA" && !charge.pagamento;
  const chargeStatus =
    isLegacyUnpaidServiceCharge
      ? "ATIVA"
      : charge?.status === "ATIVA" && charge.expira_em && charge.expira_em <= new Date()
      ? "EXPIRADA"
      : charge?.status ?? null;

  return {
    amountCents: Number(proposal.valor_centavos),
    charge: charge
      ? {
          code: charge.codigo_publico,
          expiresAt: isLegacyUnpaidServiceCharge ? null : charge.expira_em?.toISOString() ?? null,
          id: charge.id,
          paidAt: charge.paga_em?.toISOString() ?? null,
          paymentStatus: charge.pagamento?.status ?? null,
          status: chargeStatus,
        }
      : null,
    completedAt: proposal.concluido_em?.toISOString() ?? null,
    createdAt: proposal.criado_em.toISOString(),
    description: proposal.descricao,
    id: proposal.id,
    paidAt: proposal.pago_em?.toISOString() ?? null,
    paymentMode: proposal.forma_pagamento,
    respondedAt: proposal.respondido_em?.toISOString() ?? null,
    status: proposal.status,
  };
}

function serializeConversation(conversation, viewerId, { includeMessages = false } = {}) {
  const isSeller = conversation.vendedor.usuario_id === viewerId;
  const unreadCount = (conversation.mensagens ?? []).filter((message) => (
    isSeller
      ? ["CLIENTE", "SISTEMA"].includes(message.origem) && !message.lido_vendedor_em
      : ["VENDEDOR", "SISTEMA"].includes(message.origem) && !message.lido_cliente_em
  )).length;
  const otherPerson = isSeller
    ? { id: conversation.cliente.id, name: conversation.cliente.nome, photoUrl: conversation.cliente.foto_url }
    : { id: conversation.vendedor.usuario.id, name: conversation.vendedor.nome_publico, photoUrl: conversation.vendedor.usuario.foto_url };

  return {
    createdAt: conversation.criado_em.toISOString(),
    customer: { id: conversation.cliente.id, name: conversation.cliente.nome },
    id: conversation.id,
    isNewForSeller: isSeller && !conversation.visualizado_vendedor_em,
    isSeller,
    lastMessage: conversation.mensagens?.at(-1) ? serializeMessage(conversation.mensagens.at(-1), viewerId) : null,
    otherPerson,
    segment: {
      iconName: conversation.segmento_venda.icone,
      id: conversation.segmento_venda.id,
      name: conversation.segmento_venda.nome,
      slug: conversation.segmento_venda.slug,
    },
    seller: serializeSeller(conversation.vendedor, {
      isOnline: conversation.servico_vendedor?.disponivel_agora ?? false,
    }),
    proposals: (conversation.propostas ?? []).map(serializeProposal),
    request: {
      description: conversation.descricao_inicial,
      destination: conversation.destino,
      order: conversation.pedido_loja
        ? { code: conversation.pedido_loja.codigo, id: conversation.pedido_loja.id }
        : null,
      origin: conversation.origem,
      store: conversation.loja_solicitante
        ? {
            id: conversation.loja_solicitante.id,
            logoUrl: conversation.loja_solicitante.logo_url,
            name: conversation.loja_solicitante.nome,
          }
        : null,
    },
    serviceType: conversation.servico_vendedor?.tipo_servico
      ? {
          iconName: conversation.servico_vendedor.tipo_servico.icone,
          id: conversation.servico_vendedor.tipo_servico.id,
          mode: conversation.servico_vendedor.tipo_servico.modo_atendimento,
          name: conversation.servico_vendedor.tipo_servico.nome,
          operationalType: conversation.servico_vendedor.tipo_servico.tipo_operacao,
          slug: conversation.servico_vendedor.tipo_servico.slug,
        }
      : null,
    status: conversation.status,
    unreadCount,
    updatedAt: conversation.atualizado_em.toISOString(),
    ...(includeMessages ? { messages: conversation.mensagens.map((item) => serializeMessage(item, viewerId)) } : {}),
  };
}

async function findAccessibleConversation(userId, conversationId) {
  const id = parsePositiveId(conversationId, "Conversa invalida");
  const conversation = await prisma.conversaServico.findFirst({
    include: conversationInclude,
    where: {
      id,
      OR: [{ cliente_usuario_id: userId }, { vendedor: { usuario_id: userId } }],
    },
  });

  if (!conversation) throw new AppError("Conversa nao encontrada", 404);
  return conversation;
}

function notifyConversation(conversation, reason) {
  emitServiceChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id ?? conversation.cliente?.id,
    reason,
    sellerUserId: conversation.vendedor?.usuario_id,
  });
}

function serializeServiceType(type) {
  const onlineServices = type.servicos_vendedor ?? [];
  const hasAvailableProvider = type.tipo_operacao === "ENTREGA_LOCAL"
    ? onlineServices.some((service) => service.vendedor?.motoboy?.status === "ATIVO")
    : onlineServices.length > 0;

  return {
    description: type.descricao,
    id: type.id,
    iconName: type.icone,
    mode: type.modo_atendimento,
    name: type.nome,
    availableNow: hasAvailableProvider,
    operationalType: type.tipo_operacao,
    requiresCourierProfile: type.tipo_operacao === "ENTREGA_LOCAL",
    slug: type.slug,
  };
}

export async function listServiceTypes(userId, query = {}) {
  const operationalType = String(query.operationalType ?? "").toUpperCase();
  const requesterAddress = await requireUserBaseAddress(prisma, userId);
  const availableSellerWhere = {
    excluido_em: null,
    status: { in: publicSellerStatuses },
    usuario: {
      enderecos: {
        some: cityAddressWhere(requesterAddress, { userAddress: true }),
      },
    },
  };
  const types = await prisma.tipoServico.findMany({
    include: {
      servicos_vendedor: {
        select: {
          vendedor: { select: { motoboy: { select: { status: true } } } },
        },
        where: {
          disponivel_agora: true,
          excluido_em: null,
          status: "ATIVO",
          vendedor: availableSellerWhere,
        },
      },
    },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    where: {
      excluido_em: null,
      modo_atendimento: "NEGOCIACAO_CHAT",
      slug: { notIn: legacyServiceTypeSlugs },
      status: "ATIVO",
      ...(["GERAL", "ENTREGA_LOCAL"].includes(operationalType)
        ? { tipo_operacao: operationalType }
        : {}),
    },
  });
  return { serviceTypes: types.map(serializeServiceType) };
}

export async function listSellerServices(userId) {
  const [types, seller] = await Promise.all([
    prisma.tipoServico.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: {
        excluido_em: null,
        slug: { notIn: legacyServiceTypeSlugs },
        status: "ATIVO",
      },
    }),
    prisma.vendedor.findFirst({ include: { motoboy: true, servicos: { where: { excluido_em: null } } }, where: { excluido_em: null, usuario_id: userId } }),
  ]);
  const byType = new Map((seller?.servicos ?? []).map((service) => [service.tipo_servico_id, service]));
  return {
    courierProfile: seller?.motoboy ? serializeSeller(seller).courierProfile : null,
    hasSellerProfile: Boolean(seller),
    services: types.map((type) => ({
      ...serializeServiceType(type),
      available: Boolean(byType.get(type.id)?.disponivel_agora),
      enabled: Boolean(byType.get(type.id)),
      sellerServiceId: byType.get(type.id)?.id ?? null,
    })),
  };
}

export async function listOnlineServiceProviders(userId, serviceTypeId, { storeId } = {}) {
  const typeId = parsePositiveId(serviceTypeId, "Servico invalido");
  const type = await prisma.tipoServico.findFirst({
    where: {
      excluido_em: null,
      id: typeId,
      modo_atendimento: "NEGOCIACAO_CHAT",
      slug: { notIn: legacyServiceTypeSlugs },
      status: "ATIVO",
    },
  });
  if (!type) throw new AppError("Servico nao encontrado", 404);
  const requesterAddress = await requireUserBaseAddress(prisma, userId);
  const requesterStore = storeId && type.tipo_operacao === "ENTREGA_LOCAL"
    ? await findStoreForCourierRequest(userId, storeId)
    : null;
  const serviceCity = requesterStore?.endereco ?? requesterAddress;
  const services = await prisma.servicoVendedor.findMany({
    include: {
      vendedor: {
        include: {
          motoboy: true,
          usuario: { select: { foto_url: true, id: true, nome: true } },
        },
      },
    },
    orderBy: { atualizado_em: "desc" },
    where: {
      disponivel_agora: true,
      excluido_em: null,
      status: "ATIVO",
      tipo_servico_id: typeId,
      vendedor: {
        excluido_em: null,
        ...(type.tipo_operacao === "ENTREGA_LOCAL" ? { motoboy: { is: { status: "ATIVO" } } } : {}),
        status: { in: publicSellerStatuses },
        usuario_id: { not: userId },
        usuario: {
          enderecos: {
            some: cityAddressWhere(serviceCity, { userAddress: true }),
          },
        },
      },
    },
  });
  return {
    serviceType: {
      ...serializeServiceType(type),
      availableNow: services.length > 0,
    },
    sellers: services
      .filter((service) => !requesterStore || matchesStoreCity(service.vendedor.motoboy, requesterStore.endereco))
      .map((service) => ({
      ...serializeSeller(service.vendedor, { isOnline: service.disponivel_agora }),
      sellerServiceId: service.id,
      })),
  };
}

export async function updateSellerService(userId, data) {
  const seller = await prisma.vendedor.findFirst({ include: { motoboy: true }, where: { excluido_em: null, usuario_id: userId } });
  if (!seller) throw new AppError("Crie seu perfil de vendedor antes de ativar servicos", 428);
  if (["BLOQUEADO", "REPROVADO"].includes(seller.status)) {
    throw new AppError("Seu cadastro comercial nao pode atender servicos", 403);
  }
  const type = await prisma.tipoServico.findFirst({
    where: {
      excluido_em: null,
      id: data.serviceTypeId,
      slug: { notIn: legacyServiceTypeSlugs },
      status: "ATIVO",
    },
  });
  if (!type) throw new AppError("Servico nao encontrado", 404);
  if (data.available && type.tipo_operacao === "ENTREGA_LOCAL" && seller.motoboy?.status !== "ATIVO") {
    throw new AppError("Conclua seu cadastro de motoboy antes de ficar online", 428);
  }

  if (seller.status === "PENDENTE") {
    await prisma.vendedor.update({
      data: { status: "ATIVO" },
      where: { id: seller.id },
    });
  }

  const service = await prisma.servicoVendedor.upsert({
    create: { categoria: type.nome, descricao: type.descricao, disponivel_agora: data.available, nome: type.nome, preco_centavos: null, status: "ATIVO", tipo_servico_id: type.id, vendedor_id: seller.id },
    update: { disponivel_agora: data.available, status: "ATIVO" },
    where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: seller.id } },
  });

  emitServiceAvailabilityUpdated({
    available: service.disponivel_agora,
    sellerId: seller.id,
    sellerUserId: seller.usuario_id,
    serviceTypeId: type.id,
  });

  return { service: { available: service.disponivel_agora, id: service.id, serviceTypeId: type.id } };
}

export async function createServiceConversation(userId, data) {
  const requesterAddress = await requireUserBaseAddress(prisma, userId);
  const sellerServiceId = parsePositiveId(data.sellerServiceId, "Servico do prestador invalido");
  const sellerService = await prisma.servicoVendedor.findFirst({
    include: {
      tipo_servico: { include: { segmento_venda: true } },
      vendedor: { include: { motoboy: true, segmento_venda: true, usuario: { include: { enderecos: { where: { excluido_em: null }, orderBy: [{ principal: "desc" }, { criado_em: "asc" }], take: 1 } } } } },
    },
    where: {
      disponivel_agora: true,
      excluido_em: null,
      id: sellerServiceId,
      status: "ATIVO",
      tipo_servico: { excluido_em: null, modo_atendimento: "NEGOCIACAO_CHAT", status: "ATIVO" },
      vendedor: { excluido_em: null, status: { in: publicSellerStatuses } },
    },
  });

  if (!sellerService?.tipo_servico) throw new AppError("Este servico nao esta disponivel agora", 409);
  if (sellerService.tipo_servico.tipo_operacao === "ENTREGA_LOCAL" && sellerService.vendedor.motoboy?.status !== "ATIVO") {
    throw new AppError("Este motoboy nao esta disponivel para novas corridas", 409);
  }
  if (sellerService.vendedor.usuario_id === userId) throw new AppError("Voce nao pode iniciar conversa com seu proprio perfil", 400);

  const sellerAddress = sellerService.vendedor.usuario?.enderecos?.[0] ?? null;
  if (!sellerAddress || !sameCity(requesterAddress, sellerAddress)) {
    throw new AppError("Este profissional atende outra cidade", 409);
  }

  const segment = sellerService.tipo_servico.segmento_venda ?? sellerService.vendedor.segmento_venda;
  if (!segment || segment.excluido_em || segment.status !== "ATIVO") {
    throw new AppError("Este servico ainda nao possui um segmento comercial ativo", 409);
  }

  let requesterStore = null;
  let requesterOrder = null;
  if (data.storeId) {
    if (sellerService.tipo_servico.tipo_operacao !== "ENTREGA_LOCAL") {
      throw new AppError("Escolha um servico de entrega local", 409);
    }
    requesterStore = await findStoreForCourierRequest(userId, data.storeId);
    if (!matchesStoreCity(sellerService.vendedor.motoboy, requesterStore.endereco)) {
      throw new AppError("Este motoboy atende outra cidade. Escolha um profissional da sua cidade.", 409);
    }

    if (data.orderId) {
      requesterOrder = await prisma.pedidoLoja.findFirst({
        select: { id: true },
        where: {
          id: parsePositiveId(data.orderId, "Pedido invalido"),
          loja_id: requesterStore.id,
          status: { notIn: ["CANCELADO", "CONCLUIDO"] },
        },
      });
      if (!requesterOrder) throw new AppError("Pedido nao encontrado nesta loja", 404);
    }
  }

  const origin = String(data.origin ?? "").trim() || null;
  const destination = String(data.destination ?? "").trim() || null;
  const initialDescription = String(data.description ?? "").trim() || null;
  if (requesterStore && (!origin || !destination)) {
    throw new AppError("Informe origem e destino da corrida", 400);
  }

  const existing = requesterStore && !requesterOrder
    ? null
    : await prisma.conversaServico.findFirst({
        include: conversationInclude,
        orderBy: { atualizado_em: "desc" },
        where: {
          cliente_usuario_id: userId,
          loja_solicitante_id: requesterStore?.id ?? null,
          pedido_loja_id: requesterOrder?.id ?? null,
          servico_vendedor_id: sellerService.id,
          status: { in: ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"] },
        },
      });
  if (existing) return { conversation: serializeConversation(existing, userId, { includeMessages: true }) };
  const conversation = await prisma.conversaServico.create({
    include: conversationInclude,
    data: {
      cliente_usuario_id: userId,
      descricao_inicial: initialDescription,
      destino: destination,
      loja_solicitante_id: requesterStore?.id ?? null,
      pedido_loja_id: requesterOrder?.id ?? null,
      mensagens: requesterStore
        ? {
            create: {
              lido_cliente_em: new Date(),
              mensagem: `Nova corrida de ${requesterStore.nome}. Retirada: ${origin}. Destino: ${destination}.${initialDescription ? ` Detalhes: ${initialDescription}` : ""}`,
              origem: "SISTEMA",
            },
          }
        : undefined,
      origem: origin,
      segmento_venda_id: segment.id,
      servico_vendedor_id: sellerService.id,
      vendedor_id: sellerService.vendedor_id,
    },
  });
  const serialized = serializeConversation(conversation, userId, { includeMessages: true });
  emitServiceChatCreated(serialized);
  return { conversation: serialized };
}

export async function listServiceConversations(userId) {
  const conversations = await prisma.conversaServico.findMany({ include: conversationInclude, orderBy: { atualizado_em: "desc" }, where: { OR: [{ cliente_usuario_id: userId }, { vendedor: { usuario_id: userId } }] } });
  return { conversations: conversations.map((item) => serializeConversation(item, userId)) };
}

export async function getServiceConversation(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isSeller = conversation.vendedor.usuario_id === userId;
  const now = new Date();

  await prisma.cobranca.updateMany({
    data: { expira_em: null, status: "ATIVA" },
    where: {
      pagamento_id: null,
      proposta_servico: { conversa_servico_id: conversation.id },
      status: { in: ["ATIVA", "EXPIRADA"] },
    },
  });

  await prisma.$transaction([
    prisma.conversaServicoMensagem.updateMany({
      data: isSeller ? { lido_vendedor_em: now } : { lido_cliente_em: now },
      where: {
        conversa_servico_id: conversation.id,
        ...(isSeller
          ? { origem: { in: ["CLIENTE", "SISTEMA"] }, lido_vendedor_em: null }
          : { origem: { in: ["VENDEDOR", "SISTEMA"] }, lido_cliente_em: null }),
      },
    }),
    ...(isSeller
      ? [
          prisma.conversaServico.update({
            data: { visualizado_vendedor_em: now },
            where: { id: conversation.id },
          }),
        ]
      : []),
  ]);

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "read");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function createServiceProposal(userId, conversationId, data) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isSeller = conversation.vendedor.usuario_id === userId;
  const latestProposal = conversation.propostas?.at(-1) ?? null;

  if (!isSeller) throw new AppError("Somente o prestador pode enviar uma proposta", 403);
  if (!["ABERTA", "ACORDADA"].includes(conversation.status)) {
    throw new AppError("Esta conversa nao aceita novas propostas", 409);
  }
  if (
    ["PAGA", "CONCLUIDA"].includes(latestProposal?.status)
    || (
      latestProposal?.status === "ACEITA"
      && latestProposal.cobranca?.status === "ATIVA"
      && (
        !latestProposal.cobranca.expira_em
        || latestProposal.cobranca.expira_em > new Date()
      )
    )
  ) {
    throw new AppError("Finalize a proposta atual antes de enviar outra", 409);
  }

  const result = await prisma.$transaction(async (database) => {
    await database.propostaServico.updateMany({
      data: { status: "CANCELADA" },
      where: {
        conversa_servico_id: conversation.id,
        status: "PENDENTE",
      },
    });
    const proposal = await database.propostaServico.create({
      data: {
        conversa_servico_id: conversation.id,
        descricao: data.description || null,
        forma_pagamento: data.paymentMode,
        valor_centavos: BigInt(data.amountCents),
        vendedor_id: conversation.vendedor_id,
      },
    });
    await database.conversaServicoMensagem.create({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_vendedor_em: new Date(),
        mensagem: `Proposta enviada: ${formatMoney(data.amountCents)} · ${data.paymentMode === "ONLINE" ? "pagamento online" : "QR presencial"}.`,
        origem: "SISTEMA",
      },
    });
    return proposal;
  });

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "proposal-created");
  return {
    conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }),
    proposal: serializeProposal({ ...result, cobranca: null }),
  };
}

export async function acceptServiceProposal(userId, conversationId, proposalId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");
  const isSeller = conversation.vendedor.usuario_id === userId;

  if (isSeller) throw new AppError("O cliente precisa aceitar a proposta", 403);

  const result = await prisma.$transaction(async (database) => {
    const claim = await database.propostaServico.updateMany({
      data: { respondido_em: new Date(), status: "ACEITA" },
      where: {
        conversa_servico_id: conversation.id,
        id: parsedProposalId,
        status: "PENDENTE",
      },
    });

    if (claim.count !== 1) {
      throw new AppError("Esta proposta nao esta mais disponivel", 409);
    }

    const proposal = await database.propostaServico.findUnique({
      where: { id: parsedProposalId },
    });
    const charge = await createServiceConversationCharge(database, {
      conversation,
      description: proposal.descricao,
      paymentMode: proposal.forma_pagamento,
      proposalId: proposal.id,
      seller: conversation.vendedor,
      serviceName: conversation.servico_vendedor?.tipo_servico?.nome ?? conversation.segmento_venda.nome,
      valueCents: Number(proposal.valor_centavos),
    });
    await database.conversaServico.update({
      data: { status: "ACORDADA" },
      where: { id: conversation.id },
    });
    await database.conversaServicoMensagem.create({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_cliente_em: new Date(),
        mensagem: `Proposta aceita. A cobranca de ${formatMoney(proposal.valor_centavos)} esta pronta.`,
        origem: "SISTEMA",
      },
    });
    return { charge, proposal };
  });

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "proposal-accepted");
  return {
    ...(await serializeChargeWithQr(result.charge)),
    conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }),
  };
}

export async function declineServiceProposal(userId, conversationId, proposalId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");

  if (conversation.vendedor.usuario_id === userId) {
    throw new AppError("O cliente precisa recusar a proposta", 403);
  }

  const result = await prisma.propostaServico.updateMany({
    data: { respondido_em: new Date(), status: "RECUSADA" },
    where: {
      conversa_servico_id: conversation.id,
      id: parsedProposalId,
      status: "PENDENTE",
    },
  });

  if (result.count !== 1) throw new AppError("Esta proposta nao esta mais disponivel", 409);
  await prisma.conversaServicoMensagem.create({
    data: {
      autor_usuario_id: userId,
      conversa_servico_id: conversation.id,
      lido_cliente_em: new Date(),
      mensagem: "Proposta recusada. Voces podem negociar um novo valor no chat.",
      origem: "SISTEMA",
    },
  });
  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "proposal-declined");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function cancelServiceConversation(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isCourierRide = Boolean(
    conversation.loja_solicitante_id
    || conversation.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL",
  );
  if (!isCourierRide) {
    throw new AppError("Este atendimento nao e uma corrida de loja", 409);
  }
  if (!["ABERTA", "ACORDADA"].includes(conversation.status)) {
    throw new AppError("Esta corrida nao pode mais ser cancelada", 409);
  }

  const paymentLocked = (conversation.propostas ?? []).some((proposal) => (
    ["PAGA", "CONCLUIDA"].includes(proposal.status)
    || ["PAGA", "PROCESSANDO"].includes(proposal.cobranca?.status)
    || ["PAGO", "LIQUIDADO", "EM_DISPUTA"].includes(proposal.cobranca?.pagamento?.status)
  ));
  if (paymentLocked) {
    throw new AppError("A corrida possui pagamento confirmado e nao pode ser cancelada", 409);
  }

  const now = new Date();
  const isSeller = conversation.vendedor.usuario_id === userId;
  await prisma.$transaction([
    prisma.conversaServico.update({
      data: { encerrado_em: now, status: "CANCELADA" },
      where: { id: conversation.id },
    }),
    prisma.propostaServico.updateMany({
      data: { status: "CANCELADA" },
      where: {
        conversa_servico_id: conversation.id,
        status: { in: ["PENDENTE", "ACEITA"] },
      },
    }),
    prisma.cobranca.updateMany({
      data: { cancelada_em: now, status: "CANCELADA" },
      where: {
        proposta_servico: { conversa_servico_id: conversation.id },
        status: { in: ["ATIVA", "EXPIRADA"] },
      },
    }),
    prisma.solicitacaoMotoboy.updateMany({
      data: { cancelado_em: now, status: "CANCELADA" },
      where: { conversa_servico_id: conversation.id, status: "ACEITA" },
    }),
    prisma.conversaServicoMensagem.create({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        ...(isSeller ? { lido_vendedor_em: now } : { lido_cliente_em: now }),
        mensagem: `Corrida cancelada ${isSeller ? "pelo motoboy" : "pela loja"}.`,
        origem: "SISTEMA",
      },
    }),
  ]);

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-cancelled");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function markServiceDelivered(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);

  if (conversation.vendedor.usuario_id !== userId) {
    throw new AppError("Somente o prestador pode marcar o servico como prestado", 403);
  }
  if (conversation.status !== "ACORDADA") {
    throw new AppError("Este atendimento ainda nao esta pronto para conclusao", 409);
  }

  const paidProposal = [...(conversation.propostas ?? [])]
    .reverse()
    .find((proposal) => proposal.status === "PAGA");
  if (!paidProposal) throw new AppError("O pagamento precisa estar confirmado primeiro", 409);

  await prisma.$transaction([
    prisma.conversaServico.update({
      data: { status: "AGUARDANDO_CONFIRMACAO" },
      where: { id: conversation.id },
    }),
    prisma.conversaServicoMensagem.create({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_vendedor_em: new Date(),
        mensagem: "O prestador marcou o servico como realizado. Confirme o recebimento para concluir.",
        origem: "SISTEMA",
      },
    }),
  ]);
  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-delivered");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function confirmServiceCompletion(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);

  if (conversation.vendedor.usuario_id === userId) {
    throw new AppError("O cliente precisa confirmar o servico", 403);
  }
  if (conversation.status !== "AGUARDANDO_CONFIRMACAO") {
    throw new AppError("O servico ainda nao aguarda confirmacao", 409);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.conversaServico.update({
      data: { encerrado_em: now, status: "ENCERRADA" },
      where: { id: conversation.id },
    }),
    prisma.propostaServico.updateMany({
      data: { concluido_em: now, status: "CONCLUIDA" },
      where: { conversa_servico_id: conversation.id, status: "PAGA" },
    }),
    prisma.solicitacaoMotoboy.updateMany({
      data: { status: "CONCLUIDA" },
      where: { conversa_servico_id: conversation.id, status: "ACEITA" },
    }),
    prisma.conversaServicoMensagem.create({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_cliente_em: now,
        mensagem: "Servico confirmado pelo cliente e atendimento concluido.",
        origem: "SISTEMA",
      },
    }),
  ]);
  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-completed");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function createServiceConversationMessage(userId, conversationId, data, imageFile = null) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const text = String(data.message ?? "").trim();
  if (!text && !imageFile) throw new AppError("Escreva uma mensagem ou envie uma foto", 400);
  if (!["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)) throw new AppError("Esta conversa esta encerrada", 409);
  const isSeller = conversation.vendedor.usuario_id === userId;
  let upload = null;
  try {
    if (imageFile) upload = await saveUploadedImage(imageFile, { folder: ["conversas-servico", String(conversation.id)], profile: "serviceChat" });
    const message = await prisma.conversaServicoMensagem.create({ data: { autor_usuario_id: userId, conversa_servico_id: conversation.id, imagem_url: upload?.url ?? null, lido_cliente_em: isSeller ? null : new Date(), lido_vendedor_em: isSeller ? new Date() : null, mensagem: text || null, origem: isSeller ? "VENDEDOR" : "CLIENTE" } });
    const savedConversation = await prisma.conversaServico.update({ include: conversationInclude, data: {}, where: { id: conversation.id } });
    const serializedConversation = serializeConversation(savedConversation, userId, { includeMessages: true });
    const serializedMessage = serializeMessage(message, userId);
    emitServiceChatMessageCreated({ conversation: serializedConversation, message: serializedMessage });
    return { message: serializedMessage };
  } catch (error) {
    if (upload) await deleteUploadedImage(upload.url);
    throw error;
  }
}
