import {
  emitServiceAvailabilityUpdated,
  emitServiceChatCreated,
  emitServiceChatMessageCreated,
  emitServiceChatUpdated,
  emitWalletUpdated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";
import { parsePositiveId } from "../../utils/ids.js";
import { cityAddressWhere, sameCity } from "../../utils/location.js";
import { formatMoney } from "../../utils/money.js";
import {
  createServiceConversationCharge,
  serializeChargeWithQr,
} from "../charges/charge.service.js";
import { deletePrivateChatAttachment, savePrivateChatAttachment, serializeChatAttachment } from "../chat-media/chat-media.service.js";
import {
  getBusyCourierSellerIds,
  isCourierSellerBusy,
} from "../courier/courier-availability.js";
import { settlePaidAutonomousChargeEarnings } from "../earnings/order-earnings.service.js";
import {
  availableServiceWhere,
  isServiceAvailable,
} from "./service-availability.js";
import {
  createServiceChatsRepository,
  serviceChatsRepository,
} from "./service-chats.repository.js";

const publicSellerStatuses = ["ATIVO"];
const legacyServiceTypeSlugs = ["entregador"];

function isOperationalServiceAvailable(service, operationalType = null) {
  const type = operationalType ?? service?.tipo_servico?.tipo_operacao;
  return type === "ENTREGA_LOCAL"
    ? Boolean(service?.disponivel_agora && service?.status === "ATIVO" && !service?.excluido_em)
    : isServiceAvailable(service);
}

const serviceFamilies = [
  {
    key: "limpeza-externa",
    pattern: /\b(capin\w*|roca\w*|mato|terreno|lote|quintal|grama|jardin\w*)\b/,
  },
  {
    key: "eletrica",
    pattern: /\b(eletric\w*|tomada|fiacao|fiao|disjuntor|luminaria)\b/,
  },
  {
    key: "encanamento",
    pattern: /\b(encan\w*|hidraulic\w*|vazamento|torneira|cano)\b/,
  },
  {
    key: "beleza",
    pattern: /\b(cabelo|escova|barbeir\w*|manicure|unha|maquiagem)\b/,
  },
];

function normalizeServiceText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function serviceFamily(value) {
  const normalized = normalizeServiceText(value);
  return serviceFamilies.find((family) => family.pattern.test(normalized))?.key ?? null;
}

function serviceWords(value) {
  return new Set(
    normalizeServiceText(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !["com", "para", "servico", "servicos"].includes(word)),
  );
}

function findEquivalentServiceType(types, serviceName) {
  const normalizedName = normalizeServiceText(serviceName);
  const requestedFamily = serviceFamily(serviceName);
  const requestedWords = serviceWords(serviceName);

  for (const type of types) {
    if (normalizeServiceText(type.nome) === normalizedName) {
      return { reason: "exact", type };
    }
  }

  if (requestedFamily) {
    const sameFamily = types.find((type) => serviceFamily(type.nome) === requestedFamily);
    if (sameFamily) return { reason: "family", type: sameFamily };
  }

  for (const type of types) {
    const candidateWords = serviceWords(type.nome);
    const sharedWords = [...requestedWords].filter((word) => candidateWords.has(word)).length;
    const smallestSet = Math.min(requestedWords.size, candidateWords.size);
    if (sharedWords >= 2 && smallestSet > 0 && sharedWords / smallestSet >= 0.65) {
      return { reason: "keywords", type };
    }
  }

  return null;
}

function serviceSlug(name, sellerId) {
  const base = normalizeServiceText(name).replace(/\s+/g, "-").slice(0, 120) || "servico";
  return `${base}-${sellerId}`.slice(0, 140);
}

function inferServiceIcon(name) {
  const family = serviceFamily(name);
  if (family === "limpeza-externa") return "leaf";
  if (family === "eletrica") return "flash";
  if (family === "encanamento") return "water";
  if (family === "beleza") return "cut";
  return "briefcase";
}

function matchesStoreCity(courier, address) {
  return sameCity(
    { city: courier?.cidade_base, state: courier?.estado_base },
    address,
  );
}

async function findStoreForCourierRequest(userId, storeId) {
  const store = await serviceChatsRepository.findStore({
    select: {
      endereco: { select: { cidade: true, estado: true } },
      id: true,
      nome: true,
    },
    where: {
      excluido_em: null,
      id: parsePositiveId(storeId, "Loja solicitante invalida"),
      lojista: { excluido_em: null, usuario_id: userId },
    },
  });

  if (!store) throw new AppError("Voce nao possui acesso a esta loja", 403);
  if (!store.endereco) {
    throw new AppError("Cadastre o CEP e endereco comercial antes de chamar um motoboy", 428);
  }

  return store;
}

const conversationInclude = {
  avaliacao: true,
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
          acceptsPlatformCalls: seller.motoboy.aceita_chamadas_plataforma,
          color: seller.motoboy.cor_moto,
          displayName: seller.motoboy.nome_exibicao,
          plate: seller.motoboy.placa,
          rating: Number(seller.motoboy.avaliacao_media ?? 0),
          serviceRadiusKm: seller.motoboy.raio_atendimento_km,
          status: seller.motoboy.status,
          totalDeliveries: seller.motoboy.total_entregas,
          linkedStoreCount: seller.motoboy.lojas?.filter((membership) => membership.ativo).length ?? 0,
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

const sharedLocationPrefix = "__DTJ_SHARED_LOCATION__";

function parseSharedLocation(text) {
  if (!text?.startsWith(sharedLocationPrefix)) return null;

  try {
    return JSON.parse(text.slice(sharedLocationPrefix.length));
  } catch {
    return null;
  }
}

function serializeMessage(message, viewerId) {
  const kind = message.origem === "CLIENTE" ? "customer" : message.origem === "VENDEDOR" ? "seller" : "system";
  const location = parseSharedLocation(message.mensagem);
  return {
    attachment: serializeChatAttachment(message, "service", message.anexo_json)
      ?? (message.imagem_url ? { type: "IMAGE", url: message.imagem_url } : null),
    author: kind,
    createdAt: message.criado_em.toISOString(),
    id: message.id,
    imageUrl: message.imagem_url,
    isMine: message.autor_usuario_id === viewerId,
    readAt: (
      message.origem === "CLIENTE"
        ? message.lido_vendedor_em
        : message.origem === "VENDEDOR"
          ? message.lido_cliente_em
          : null
    )?.toISOString() ?? null,
    location,
    text: location ? null : message.mensagem,
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

function serializeReview(review) {
  if (!review) return null;

  return {
    comment: review.comentario,
    createdAt: review.criado_em.toISOString(),
    rating: review.nota,
  };
}

function serializeConversation(conversation, viewerId, { includeMessages = false } = {}) {
  const isSeller = conversation.vendedor.usuario_id === viewerId;
  const routeIsSharedInChat = Boolean(
    conversation.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL"
    && !conversation.loja_solicitante_id,
  );
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
      isOnline: isOperationalServiceAvailable(conversation.servico_vendedor),
    }),
    proposals: (conversation.propostas ?? []).map(serializeProposal),
    request: {
      description: conversation.descricao_inicial,
      destination: routeIsSharedInChat ? "A combinar no chat" : conversation.destino,
      order: conversation.pedido_loja
        ? { code: conversation.pedido_loja.codigo, id: conversation.pedido_loja.id }
        : null,
      origin: routeIsSharedInChat ? "A combinar no chat" : conversation.origem,
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
    canDispute: !isSeller && conversation.status === "AGUARDANDO_CONFIRMACAO",
    canReview: !isSeller && conversation.status === "ENCERRADA" && !conversation.avaliacao,
    review: serializeReview(conversation.avaliacao),
    unreadCount,
    updatedAt: conversation.atualizado_em.toISOString(),
    ...(includeMessages ? { messages: conversation.mensagens.map((item) => serializeMessage(item, viewerId)) } : {}),
  };
}

async function findAccessibleConversation(userId, conversationId) {
  const id = parsePositiveId(conversationId, "Conversa invalida");
  const conversation = await serviceChatsRepository.findConversation({
    include: conversationInclude,
    where: {
      id,
      OR: [{ cliente_usuario_id: userId }, { vendedor: { usuario_id: userId } }],
    },
  });

  if (!conversation) throw new AppError("Conversa nao encontrada", 404);
  return conversation;
}

async function assertSellerCanOperateConversation(repository, conversation, userId) {
  const seller = await repository.findSeller({
    select: { id: true },
    where: {
      excluido_em: null,
      id: conversation.vendedor_id,
      status: "ATIVO",
      status_kyc: "APROVADO",
      usuario: { is: commercialTier2UserWhere },
      usuario_id: userId,
    },
  });

  if (!seller) {
    throw new AppError(
      "Seu perfil de prestador esta inativo ou sem KYC aprovado. Regularize a conta para continuar atendendo.",
      403,
    );
  }
}

function notifyConversation(conversation, reason) {
  emitServiceChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id ?? conversation.cliente?.id,
    reason,
    sellerUserId: conversation.vendedor?.usuario_id,
  });
}

function notifyCourierAvailability(conversation, available) {
  if (conversation.servico_vendedor?.tipo_servico?.tipo_operacao !== "ENTREGA_LOCAL") return;
  emitServiceAvailabilityUpdated({
    available,
    sellerId: conversation.vendedor_id,
    sellerUserId: conversation.vendedor?.usuario_id,
    serviceTypeId: conversation.servico_vendedor.tipo_servico_id,
  });
}

function serializeServiceType(type) {
  const onlineServices = type.servicos_vendedor ?? [];
  const hasAvailableProvider = type.tipo_operacao === "ENTREGA_LOCAL"
    ? onlineServices.some((service) => {
        const courier = service.vendedor?.motoboy;
        return courier?.status === "ATIVO"
          && (courier.aceita_chamadas_plataforma || !courier.lojas?.length);
      })
    : onlineServices.length > 0;

  return {
    description: type.descricao,
    id: type.id,
    iconName: type.icone,
    mode: type.modo_atendimento,
    name: type.nome,
    availableNow: hasAvailableProvider,
    operationalType: type.tipo_operacao,
    registrationRequirements: type.requisitos_cadastro ?? {
      requiresDriverLicense: false,
      requiresPlate: false,
      requiresVehicle: false,
      vehicleKinds: [],
    },
    requiresCourierProfile: type.tipo_operacao === "ENTREGA_LOCAL",
    slug: type.slug,
  };
}

function validateServiceRegistration(type, registration, courierProfile) {
  const requirements = type.requisitos_cadastro ?? {};
  if (!requirements.requiresVehicle && !requirements.requiresDriverLicense && !requirements.requiresPlate) {
    return;
  }

  const fallback = type.tipo_operacao === "ENTREGA_LOCAL" && courierProfile
    ? {
        driverLicense: courierProfile.cnh,
        plate: courierProfile.placa,
        vehicleKind: "MOTO",
        vehicleModel: courierProfile.modelo_moto,
      }
    : {};
  const values = { ...fallback, ...(registration ?? {}) };
  const allowedKinds = Array.isArray(requirements.vehicleKinds) ? requirements.vehicleKinds : [];

  if (requirements.requiresVehicle) {
    if (!values.vehicleKind || !String(values.vehicleModel ?? "").trim()) {
      throw new AppError("Cadastre o veiculo exigido para realizar este servico", 428);
    }
    if (allowedKinds.length && !allowedKinds.includes(values.vehicleKind)) {
      throw new AppError("O tipo de veiculo informado nao atende este servico", 409);
    }
  }
  if (requirements.requiresDriverLicense && String(values.driverLicense ?? "").replace(/\D/g, "").length !== 11) {
    throw new AppError("Cadastre uma CNH valida para realizar este servico", 428);
  }
  if (requirements.requiresPlate && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(values.plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""))) {
    throw new AppError("Cadastre uma placa valida para realizar este servico", 428);
  }
}

export async function listServiceTypes(userId, query = {}) {
  const operationalType = String(query.operationalType ?? "").toUpperCase();
  const requesterAddress = await serviceChatsRepository.getUserBaseAddress(userId);
  const availableSellerWhere = {
    excluido_em: null,
    status: { in: publicSellerStatuses },
    status_kyc: "APROVADO",
    usuario: {
      is: {
        ...commercialTier2UserWhere,
        enderecos: {
          some: cityAddressWhere(requesterAddress, { userAddress: true }),
        },
      },
    },
  };
  const types = await serviceChatsRepository.findServiceTypes({
    include: {
      servicos_vendedor: {
        select: {
          vendedor_id: true,
          vendedor: {
            select: {
              motoboy: {
                select: {
                  aceita_chamadas_plataforma: true,
                  lojas: { select: { id: true }, where: { ativo: true } },
                  status: true,
                },
              },
            },
          },
        },
        where: {
          ...availableServiceWhere(),
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
  const busySellerIds = await getBusyCourierSellerIds(
    serviceChatsRepository,
    types.flatMap((type) => type.servicos_vendedor.map((service) => service.vendedor_id)),
  );
  for (const type of types) {
    if (type.tipo_operacao !== "ENTREGA_LOCAL") continue;
    type.servicos_vendedor = type.servicos_vendedor.filter(
      (service) => !busySellerIds.has(service.vendedor_id),
    );
  }
  return { serviceTypes: types.map(serializeServiceType) };
}

export async function listSellerServices(userId) {
  const [types, seller] = await Promise.all([
    serviceChatsRepository.findServiceTypes({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: {
        excluido_em: null,
        slug: { notIn: legacyServiceTypeSlugs },
        status: "ATIVO",
      },
    }),
    serviceChatsRepository.findSeller({
      include: {
        motoboy: { include: { lojas: { where: { ativo: true }, select: { ativo: true } } } },
        servicos: { where: { excluido_em: null } },
      },
      where: { excluido_em: null, usuario_id: userId },
    }),
  ]);
  const byType = new Map((seller?.servicos ?? []).map((service) => [service.tipo_servico_id, service]));
  return {
    courierProfile: seller?.motoboy ? serializeSeller(seller).courierProfile : null,
    hasSellerProfile: Boolean(seller),
    services: types.map((type) => ({
      ...serializeServiceType(type),
      available: isOperationalServiceAvailable(byType.get(type.id), type.tipo_operacao),
      enabled: Boolean(byType.get(type.id)),
      registrationData: byType.get(type.id)?.dados_cadastro ?? null,
      sellerServiceId: byType.get(type.id)?.id ?? null,
    })),
  };
}

export async function listOnlineServiceProviders(userId, serviceTypeId, { storeId } = {}) {
  const typeId = parsePositiveId(serviceTypeId, "Servico invalido");
  const type = await serviceChatsRepository.findServiceType({
    where: {
      excluido_em: null,
      id: typeId,
      modo_atendimento: "NEGOCIACAO_CHAT",
      slug: { notIn: legacyServiceTypeSlugs },
      status: "ATIVO",
    },
  });
  if (!type) throw new AppError("Servico nao encontrado", 404);
  const requesterAddress = await serviceChatsRepository.getUserBaseAddress(userId);
  const requesterStore = storeId && type.tipo_operacao === "ENTREGA_LOCAL"
    ? await findStoreForCourierRequest(userId, storeId)
    : null;
  const serviceCity = requesterStore?.endereco ?? requesterAddress;
  const services = await serviceChatsRepository.findSellerServices({
    include: {
      vendedor: {
        include: {
          motoboy: {
            include: {
              lojas: { select: { id: true }, where: { ativo: true } },
            },
          },
          usuario: { select: { foto_url: true, id: true, nome: true } },
        },
      },
    },
    orderBy: { atualizado_em: "desc" },
    where: {
      ...availableServiceWhere(),
      excluido_em: null,
      status: "ATIVO",
      tipo_servico_id: typeId,
      vendedor: {
        excluido_em: null,
        ...(type.tipo_operacao === "ENTREGA_LOCAL" ? { motoboy: { is: { status: "ATIVO" } } } : {}),
        status: { in: publicSellerStatuses },
        status_kyc: "APROVADO",
        usuario_id: { not: userId },
        usuario: {
          is: {
            ...commercialTier2UserWhere,
            enderecos: {
              some: cityAddressWhere(serviceCity, { userAddress: true }),
            },
          },
        },
      },
    },
  });
  const busySellerIds = type.tipo_operacao === "ENTREGA_LOCAL"
    ? await getBusyCourierSellerIds(serviceChatsRepository, services.map((service) => service.vendedor_id))
    : new Set();
  const availableServices = services
    .filter((service) => !busySellerIds.has(service.vendedor_id))
    .filter((service) => (
      type.tipo_operacao !== "ENTREGA_LOCAL"
      || service.vendedor.motoboy?.aceita_chamadas_plataforma
      || !service.vendedor.motoboy?.lojas?.length
    ))
    .filter((service) => !requesterStore || matchesStoreCity(service.vendedor.motoboy, requesterStore.endereco));
  return {
    serviceType: {
      ...serializeServiceType(type),
      availableNow: availableServices.length > 0,
    },
    sellers: type.tipo_operacao === "ENTREGA_LOCAL" ? [] : availableServices
      .map((service) => ({
      ...serializeSeller(service.vendedor, { isOnline: isServiceAvailable(service) }),
      sellerServiceId: service.id,
      })),
  };
}

export async function updateSellerService(userId, data) {
  await serviceChatsRepository.requireCommercialTier2(userId);
  const seller = await serviceChatsRepository.findSeller({ include: { motoboy: true, servicos: { where: { excluido_em: null } } }, where: { excluido_em: null, usuario_id: userId } });
  if (!seller) throw new AppError("Crie seu perfil de vendedor antes de ativar servicos", 428);
  if (seller.status !== "ATIVO" || seller.status_kyc !== "APROVADO") {
    throw new AppError("Conclua a verificacao comercial antes de atender servicos", 428);
  }
  const type = await serviceChatsRepository.findServiceType({
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

  const existingService = seller.servicos.find((service) => service.tipo_servico_id === type.id);
  const registration = data.registration ?? existingService?.dados_cadastro ?? null;
  if (data.available) validateServiceRegistration(type, registration, seller.motoboy);

  const availabilityUpdatedAt = data.available ? new Date() : null;
  const service = await serviceChatsRepository.upsertSellerService({
    create: { categoria: type.nome, dados_cadastro: registration, descricao: type.descricao, disponibilidade_atualizada_em: availabilityUpdatedAt, disponivel_agora: data.available, nome: type.nome, preco_centavos: null, status: "ATIVO", tipo_servico_id: type.id, vendedor_id: seller.id },
    update: { ...(data.registration ? { dados_cadastro: data.registration } : {}), disponibilidade_atualizada_em: availabilityUpdatedAt, disponivel_agora: data.available, status: "ATIVO" },
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

export async function heartbeatSellerServices(userId) {
  const seller = await serviceChatsRepository.findSeller({
    select: { id: true },
    where: {
      excluido_em: null,
      status: "ATIVO",
      status_kyc: "APROVADO",
      usuario: { is: commercialTier2UserWhere },
      usuario_id: userId,
    },
  });
  if (!seller) return { activeServices: 0 };

  const updated = await serviceChatsRepository.updateSellerServices({
    data: { disponibilidade_atualizada_em: new Date() },
    where: {
      disponivel_agora: true,
      excluido_em: null,
      status: "ATIVO",
      vendedor_id: seller.id,
    },
  });
  return { activeServices: updated.count };
}

export async function registerSellerService(userId, data) {
  await serviceChatsRepository.requireCommercialTier2(userId);
  const seller = await serviceChatsRepository.findSeller({
    include: { segmento_venda: true },
    where: { excluido_em: null, usuario_id: userId },
  });
  if (!seller) throw new AppError("Crie seu perfil de vendedor antes de cadastrar servicos", 428);
  if (seller.status !== "ATIVO" || seller.status_kyc !== "APROVADO") {
    throw new AppError("Conclua a verificacao comercial antes de cadastrar servicos", 428);
  }
  if (!seller.segmento_venda || seller.segmento_venda.excluido_em || seller.segmento_venda.status !== "ATIVO") {
    throw new AppError("Defina um segmento comercial ativo antes de cadastrar servicos", 409);
  }

  const serviceName = String(data.name).trim();
  const availabilityUpdatedAt = data.available ? new Date() : null;
  const result = await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    const types = await repository.findServiceTypes({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: {
        excluido_em: null,
        modo_atendimento: "NEGOCIACAO_CHAT",
        slug: { notIn: legacyServiceTypeSlugs },
        status: "ATIVO",
        tipo_operacao: "GERAL",
        OR: [
          { segmento_venda_id: seller.segmento_venda_id },
          { segmento_venda_id: null },
        ],
      },
    });
    let match = findEquivalentServiceType(types, serviceName);
    let type = match?.type ?? null;

    if (!type) {
      try {
        type = await repository.createServiceType({
          data: {
            descricao: data.description || null,
            icone: inferServiceIcon(serviceName),
            modo_atendimento: "NEGOCIACAO_CHAT",
            nome: serviceName,
            ordem: 9999,
            segmento_venda_id: seller.segmento_venda_id,
            slug: serviceSlug(serviceName, seller.id),
            status: "ATIVO",
            tipo_operacao: "GERAL",
          },
        });
        match = { reason: "created", type };
      } catch (error) {
        if (error?.code !== "P2002") throw error;
        type = await repository.findServiceType({
          where: {
            excluido_em: null,
            modo_atendimento: "NEGOCIACAO_CHAT",
            nome: serviceName,
            status: "ATIVO",
            tipo_operacao: "GERAL",
          },
        });
        if (!type) throw new AppError("Nao foi possivel cadastrar este servico agora", 409);
        match = { reason: "exact", type };
      }
    }

    const service = await repository.upsertSellerService({
      create: {
        categoria: seller.segmento_venda.nome,
        descricao: data.description || type.descricao || null,
        disponibilidade_atualizada_em: availabilityUpdatedAt,
        disponivel_agora: data.available,
        nome: type.nome,
        preco_centavos: null,
        status: "ATIVO",
        tipo_servico_id: type.id,
        vendedor_id: seller.id,
      },
      update: {
        ...(data.description ? { descricao: data.description } : {}),
        disponibilidade_atualizada_em: availabilityUpdatedAt,
        disponivel_agora: data.available,
        status: "ATIVO",
      },
      where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: seller.id } },
    });

    return { match, service, type };
  });

  emitServiceAvailabilityUpdated({
    available: result.service.disponivel_agora,
    sellerId: seller.id,
    sellerUserId: seller.usuario_id,
    serviceTypeId: result.type.id,
  });

  return {
    createdType: result.match.reason === "created",
    matchedBy: result.match.reason,
    service: {
      available: result.service.disponivel_agora,
      id: result.service.id,
      name: result.type.nome,
      serviceTypeId: result.type.id,
    },
  };
}

export async function createServiceConversation(userId, data) {
  const requesterAddress = await serviceChatsRepository.getUserBaseAddress(userId);
  const sellerServiceId = parsePositiveId(data.sellerServiceId, "Servico do prestador invalido");
  const sellerService = await serviceChatsRepository.findSellerService({
    include: {
      tipo_servico: { include: { segmento_venda: true } },
      vendedor: { include: { motoboy: true, segmento_venda: true, usuario: { include: { enderecos: { where: { excluido_em: null }, orderBy: [{ principal: "desc" }, { criado_em: "asc" }], take: 1 } } } } },
    },
    where: {
      ...availableServiceWhere(),
      excluido_em: null,
      id: sellerServiceId,
      status: "ATIVO",
      tipo_servico: { excluido_em: null, modo_atendimento: "NEGOCIACAO_CHAT", status: "ATIVO" },
      vendedor: {
        excluido_em: null,
        status: { in: publicSellerStatuses },
        status_kyc: "APROVADO",
        usuario: { is: commercialTier2UserWhere },
      },
    },
  });

  if (!sellerService?.tipo_servico) throw new AppError("Este servico nao esta disponivel agora", 409);
  if (sellerService.tipo_servico.tipo_operacao === "ENTREGA_LOCAL") {
    throw new AppError("Chame um motoboy pela central de entregas para aguardar o aceite", 409);
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

  if (data.storeId || data.orderId) {
    throw new AppError("Use a central de entregas para solicitar motoboy para uma loja", 409);
  }

  const origin = String(data.origin ?? "").trim() || null;
  const destination = String(data.destination ?? "").trim() || null;
  const initialDescription = String(data.description ?? "").trim() || null;

  const activeConversationWhere = {
    cliente_usuario_id: userId,
    loja_solicitante_id: null,
    pedido_loja_id: null,
    servico_vendedor_id: sellerService.id,
    status: { in: ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"] },
  };
  let result;
  try {
    result = await serviceChatsRepository.transaction(async (database) => {
      const repository = createServiceChatsRepository(database);
      await repository.lockServiceConversation(userId, sellerService.id);
      const existing = await repository.findConversation({
        include: conversationInclude,
        orderBy: { atualizado_em: "desc" },
        where: activeConversationWhere,
      });
      if (existing) return { created: false, conversation: existing };

      const conversation = await repository.createConversation({
        include: conversationInclude,
        data: {
          cliente_usuario_id: userId,
          descricao_inicial: initialDescription,
          destino: destination,
          loja_solicitante_id: null,
          pedido_loja_id: null,
          origem: origin,
          segmento_venda_id: segment.id,
          servico_vendedor_id: sellerService.id,
          vendedor_id: sellerService.vendedor_id,
        },
      });
      return { created: true, conversation };
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await serviceChatsRepository.findConversation({
      include: conversationInclude,
      orderBy: { atualizado_em: "desc" },
      where: activeConversationWhere,
    });
    if (!existing) throw error;
    result = { created: false, conversation: existing };
  }
  const serialized = serializeConversation(result.conversation, userId, { includeMessages: true });
  if (result.created) {
    emitServiceChatCreated(serialized);
    notifyCourierAvailability(result.conversation, false);
  }
  return { conversation: serialized, reused: !result.created };
}

export async function createServiceReview(userId, conversationId, data) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  if (conversation.vendedor.usuario_id === userId) {
    throw new AppError("Somente o cliente pode avaliar este atendimento", 403);
  }
  if (conversation.status !== "ENCERRADA") {
    throw new AppError("A avaliacao fica disponivel apos a conclusao confirmada", 409);
  }

  try {
    await serviceChatsRepository.transaction(async (database) => {
      const repository = createServiceChatsRepository(database);
      await repository.createReview({
        data: {
          avaliador_usuario_id: userId,
          comentario: data.comment || null,
          conversa_servico_id: conversation.id,
          nota: data.rating,
          vendedor_id: conversation.vendedor_id,
        },
      });
      const summary = await repository.aggregateReviews({
        _avg: { nota: true },
        where: { vendedor_id: conversation.vendedor_id },
      });
      const average = summary._avg.nota ?? 0;
      await Promise.all([
        repository.updateSeller({
          data: { avaliacao_media: average },
          where: { id: conversation.vendedor_id },
        }),
        repository.updateMotoboys({
          data: { avaliacao_media: average },
          where: { vendedor_id: conversation.vendedor_id },
        }),
      ]);
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Este atendimento ja foi avaliado", 409);
    }
    throw error;
  }

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-reviewed");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function listServiceConversations(userId) {
  const conversations = await serviceChatsRepository.findConversations({ include: conversationInclude, orderBy: { atualizado_em: "desc" }, where: { OR: [{ cliente_usuario_id: userId }, { vendedor: { usuario_id: userId } }] } });
  return { conversations: conversations.map((item) => serializeConversation(item, userId)) };
}

export async function getServiceConversation(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isSeller = conversation.vendedor.usuario_id === userId;
  const now = new Date();
  const hasUnreadMessages = (conversation.mensagens ?? []).some((message) => (
    isSeller
      ? ["CLIENTE", "SISTEMA"].includes(message.origem) && !message.lido_vendedor_em
      : ["VENDEDOR", "SISTEMA"].includes(message.origem) && !message.lido_cliente_em
  ));
  const needsSellerView = isSeller && !conversation.visualizado_vendedor_em;

  await serviceChatsRepository.updateCharges({
    data: { expira_em: null, status: "ATIVA" },
    where: {
      pagamento_id: null,
      proposta_servico: { conversa_servico_id: conversation.id },
      status: { in: ["ATIVA", "EXPIRADA"] },
    },
  });

  if (hasUnreadMessages || needsSellerView) {
    await serviceChatsRepository.transaction([
      ...(hasUnreadMessages
        ? [serviceChatsRepository.updateMessages({
            data: isSeller ? { lido_vendedor_em: now } : { lido_cliente_em: now },
            where: {
              conversa_servico_id: conversation.id,
              ...(isSeller
                ? { origem: { in: ["CLIENTE", "SISTEMA"] }, lido_vendedor_em: null }
                : { origem: { in: ["VENDEDOR", "SISTEMA"] }, lido_cliente_em: null }),
            },
          })]
        : []),
      ...(needsSellerView
        ? [serviceChatsRepository.updateConversation({
            data: { visualizado_vendedor_em: now },
            where: { id: conversation.id },
          })]
        : []),
    ]);
  }

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  if (hasUnreadMessages || needsSellerView) {
    notifyConversation(updatedConversation, "read");
  }
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function acceptServiceConversation(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isSeller = conversation.vendedor.usuario_id === userId;
  const isCourierRide = conversation.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL";

  if (!isSeller) throw new AppError("Somente o prestador pode aceitar este chamado", 403);
  if (isCourierRide) throw new AppError("A corrida ja e aceita pela central de entregas", 409);

  const now = new Date();
  await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    await assertSellerCanOperateConversation(repository, conversation, userId);
    const claimed = await repository.updateConversations({
      data: { status: "ACORDADA", visualizado_vendedor_em: now },
      where: { id: conversation.id, status: "ABERTA" },
    });
    if (claimed.count !== 1) {
      throw new AppError("Este chamado nao esta mais aguardando aceite", 409);
    }
    await repository.createMessage({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_vendedor_em: now,
        mensagem: "Chamado aceito. O chat foi liberado para a negociacao.",
        origem: "SISTEMA",
      },
    });
  });

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-request-accepted");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function createServiceProposal(userId, conversationId, data) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const isSeller = conversation.vendedor.usuario_id === userId;
  const latestProposal = conversation.propostas?.at(-1) ?? null;

  if (!isSeller) throw new AppError("Somente o prestador pode enviar uma proposta", 403);
  if (conversation.status !== "ACORDADA") {
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

  const result = await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    await assertSellerCanOperateConversation(repository, conversation, userId);
    await repository.updateProposals({
      data: { status: "CANCELADA" },
      where: {
        conversa_servico_id: conversation.id,
        status: "PENDENTE",
      },
    });
    const proposal = await repository.createProposal({
      data: {
        conversa_servico_id: conversation.id,
        descricao: data.description || null,
        forma_pagamento: data.paymentMode,
        valor_centavos: BigInt(data.amountCents),
        vendedor_id: conversation.vendedor_id,
      },
    });
    await repository.createMessage({
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

export async function acceptServiceProposal(userId, conversationId, proposalId, data = {}) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const parsedProposalId = parsePositiveId(proposalId, "Proposta invalida");
  const isSeller = conversation.vendedor.usuario_id === userId;

  if (isSeller) throw new AppError("O cliente precisa aceitar a proposta", 403);

  const result = await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    await repository.requireCommercialTier2(conversation.vendedor.usuario_id);
    const claim = await repository.updateProposals({
      data: {
        ...(data.paymentMode ? { forma_pagamento: data.paymentMode } : {}),
        respondido_em: new Date(),
        status: "ACEITA",
      },
      where: {
        conversa_servico_id: conversation.id,
        id: parsedProposalId,
        status: "PENDENTE",
      },
    });

    if (claim.count !== 1) {
      throw new AppError("Esta proposta nao esta mais disponivel", 409);
    }

    const proposal = await repository.findProposal({
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
    await repository.updateConversation({
      data: { status: "ACORDADA" },
      where: { id: conversation.id },
    });
    await repository.createMessage({
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

  const result = await serviceChatsRepository.updateProposals({
    data: { respondido_em: new Date(), status: "RECUSADA" },
    where: {
      conversa_servico_id: conversation.id,
      id: parsedProposalId,
      status: "PENDENTE",
    },
  });

  if (result.count !== 1) throw new AppError("Esta proposta nao esta mais disponivel", 409);
  await serviceChatsRepository.createMessage({
    data: {
      autor_usuario_id: userId,
      conversa_servico_id: conversation.id,
      lido_cliente_em: new Date(),
      mensagem: "Proposta recusada. Voces podem negociar um novo valor no chat.",
      origem: "SISTEMA",
    },
  });
  await serviceChatsRepository.updateConversation({
    data: { atualizado_em: new Date() },
    where: { id: conversation.id },
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
  if (!["ABERTA", "ACORDADA"].includes(conversation.status)) {
    throw new AppError("Este atendimento nao pode mais ser cancelado", 409);
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
  await serviceChatsRepository.transaction([
    serviceChatsRepository.updateConversation({
      data: { encerrado_em: now, status: "CANCELADA" },
      where: { id: conversation.id },
    }),
    serviceChatsRepository.updateProposals({
      data: { status: "CANCELADA" },
      where: {
        conversa_servico_id: conversation.id,
        status: { in: ["PENDENTE", "ACEITA"] },
      },
    }),
    serviceChatsRepository.updateCharges({
      data: { cancelada_em: now, status: "CANCELADA" },
      where: {
        proposta_servico: { conversa_servico_id: conversation.id },
        status: { in: ["ATIVA", "EXPIRADA"] },
      },
    }),
    serviceChatsRepository.updateCourierRequests({
      data: { cancelado_em: now, status: "CANCELADA" },
      where: { conversa_servico_id: conversation.id, status: "ACEITA" },
    }),
    serviceChatsRepository.createMessage({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        ...(isSeller ? { lido_vendedor_em: now } : { lido_cliente_em: now }),
        mensagem: isCourierRide
          ? `Corrida cancelada ${isSeller ? "pelo motoboy" : "pelo solicitante"}.`
          : `Chamado cancelado ${isSeller ? "pelo prestador" : "pelo cliente"}.`,
        origem: "SISTEMA",
      },
    }),
  ]);

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-cancelled");
  notifyCourierAvailability(
    updatedConversation,
    isOperationalServiceAvailable(updatedConversation.servico_vendedor)
      && !(await isCourierSellerBusy(serviceChatsRepository, updatedConversation.vendedor_id)),
  );
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

  await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    await assertSellerCanOperateConversation(repository, conversation, userId);
    const marked = await repository.updateConversations({
      data: { status: "AGUARDANDO_CONFIRMACAO" },
      where: { id: conversation.id, status: "ACORDADA" },
    });
    if (marked.count !== 1) {
      throw new AppError("O atendimento mudou antes da confirmacao de execucao", 409);
    }
    await repository.createMessage({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_vendedor_em: new Date(),
        mensagem: "O prestador marcou o servico como realizado. Confirme o recebimento para concluir.",
        origem: "SISTEMA",
      },
    });
  });
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

  const paidProposal = [...(conversation.propostas ?? [])]
    .reverse()
    .find((proposal) => proposal.status === "PAGA" && proposal.cobranca?.id);
  if (!paidProposal?.cobranca?.id) {
    throw new AppError("Nenhum pagamento confirmado foi encontrado para este servico", 409);
  }

  const now = new Date();
  const result = await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    const closed = await repository.updateConversations({
      data: { encerrado_em: now, status: "ENCERRADA" },
      where: { id: conversation.id, status: "AGUARDANDO_CONFIRMACAO" },
    });
    if (closed.count !== 1) {
      throw new AppError("O servico mudou antes da confirmacao", 409);
    }

    const completed = await repository.updateProposals({
      data: { concluido_em: now, status: "CONCLUIDA" },
      where: { conversa_servico_id: conversation.id, id: paidProposal.id, status: "PAGA" },
    });
    if (completed.count !== 1) {
      throw new AppError("A proposta mudou antes da confirmacao", 409);
    }

    await Promise.all([
      repository.updateCourierRequests({
        data: { status: "CONCLUIDA" },
        where: { conversa_servico_id: conversation.id, status: "ACEITA" },
      }),
      // Cobre pagamentos iniciados antes desta regra: a janela de seguranca
      // sempre passa a contar da confirmacao do cliente.
      repository.updateCommercialTransactions({
        data: { validada_em: now },
        where: {
          status: "VALIDADA",
          pagamento: { cobranca: { proposta_servico_id: paidProposal.id } },
        },
      }),
      repository.createMessage({
        data: {
          autor_usuario_id: userId,
          conversa_servico_id: conversation.id,
          lido_cliente_em: now,
          mensagem: "Servico confirmado pelo cliente e atendimento concluido. Os valores entram em retencao de seguranca por 24 horas.",
          origem: "SISTEMA",
        },
      }),
    ]);

    const earnings = await settlePaidAutonomousChargeEarnings(database, paidProposal.cobranca.id);
    return { earnings };
  });
  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  emitWalletUpdated({
    transactionId: result.earnings.transactionId,
    userIds: result.earnings.walletUserIds,
  });
  notifyConversation(updatedConversation, "service-completed");
  notifyCourierAvailability(
    updatedConversation,
    isOperationalServiceAvailable(updatedConversation.servico_vendedor)
      && !(await isCourierSellerBusy(serviceChatsRepository, updatedConversation.vendedor_id)),
  );
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function disputeServiceCompletion(userId, conversationId) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  if (conversation.vendedor.usuario_id === userId) {
    throw new AppError("Somente o cliente pode contestar a conclusao do servico", 403);
  }
  if (conversation.status !== "AGUARDANDO_CONFIRMACAO") {
    throw new AppError("Este atendimento nao esta aguardando confirmacao do cliente", 409);
  }

  const now = new Date();
  const result = await serviceChatsRepository.transaction(async (database) => {
    const repository = createServiceChatsRepository(database);
    const disputed = await repository.updateConversations({
      data: { status: "EM_DISPUTA" },
      where: { id: conversation.id, status: "AGUARDANDO_CONFIRMACAO" },
    });
    if (disputed.count !== 1) {
      throw new AppError("O atendimento mudou antes da contestacao", 409);
    }
    await repository.createMessage({
      data: {
        autor_usuario_id: userId,
        conversa_servico_id: conversation.id,
        lido_cliente_em: now,
        mensagem: "Cliente contestou a conclusao. O valor continua sob custodia enquanto o suporte analisa o caso.",
        origem: "SISTEMA",
      },
    });
  });

  const updatedConversation = await findAccessibleConversation(userId, conversation.id);
  notifyConversation(updatedConversation, "service-disputed");
  return { conversation: serializeConversation(updatedConversation, userId, { includeMessages: true }) };
}

export async function createServiceConversationMessage(userId, conversationId, data, attachmentFile = null) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  const text = String(data.message ?? "").trim();
  if (!text && !data.attachmentType) throw new AppError("Escreva uma mensagem ou envie um anexo", 400);
  if (conversation.status === "ABERTA") throw new AppError("Aguarde o prestador aceitar o chamado", 409);
  if (!["ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)) throw new AppError("Esta conversa esta encerrada", 409);
  const isSeller = conversation.vendedor.usuario_id === userId;
  if (isSeller) {
    await assertSellerCanOperateConversation(serviceChatsRepository, conversation, userId);
  }
  const attachment = await savePrivateChatAttachment(attachmentFile, data, {
    conversationId: conversation.id,
    scope: "service",
  });
  try {
    const message = await serviceChatsRepository.createMessage({ data: { anexo_json: attachment, autor_usuario_id: userId, conversa_servico_id: conversation.id, lido_cliente_em: isSeller ? null : new Date(), lido_vendedor_em: isSeller ? new Date() : null, mensagem: text || null, origem: isSeller ? "VENDEDOR" : "CLIENTE" } });
    const savedConversation = await serviceChatsRepository.updateConversation({
      include: conversationInclude,
      data: { atualizado_em: new Date() },
      where: { id: conversation.id },
    });
    const serializedConversation = serializeConversation(savedConversation, userId, { includeMessages: true });
    const serializedMessage = serializeMessage(message, userId);
    emitServiceChatMessageCreated({ conversation: serializedConversation, message: serializedMessage });
    return { message: serializedMessage };
  } catch (error) {
    await deletePrivateChatAttachment(attachment);
    throw error;
  }
}

export async function createServiceConversationLocation(userId, conversationId, data) {
  const conversation = await findAccessibleConversation(userId, conversationId);
  if (conversation.status === "ABERTA") {
    throw new AppError("Aguarde o prestador aceitar o chamado", 409);
  }
  if (!["ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)) {
    throw new AppError("Esta conversa esta encerrada", 409);
  }

  const isSeller = conversation.vendedor.usuario_id === userId;
  if (isSeller) {
    await assertSellerCanOperateConversation(serviceChatsRepository, conversation, userId);
  }
  const location = {
    city: data.city,
    complement: data.complement || null,
    district: data.district,
    label: data.label,
    number: data.number,
    reference: data.reference || null,
    state: data.state,
    street: data.street,
    zipCode: data.zipCode,
  };
  const message = await serviceChatsRepository.createMessage({
    data: {
      autor_usuario_id: userId,
      conversa_servico_id: conversation.id,
      lido_cliente_em: isSeller ? null : new Date(),
      lido_vendedor_em: isSeller ? new Date() : null,
      mensagem: `${sharedLocationPrefix}${JSON.stringify(location)}`,
      origem: isSeller ? "VENDEDOR" : "CLIENTE",
    },
  });
  const savedConversation = await serviceChatsRepository.updateConversation({
    include: conversationInclude,
    data: { atualizado_em: new Date() },
    where: { id: conversation.id },
  });
  const serializedConversation = serializeConversation(savedConversation, userId, { includeMessages: true });
  const serializedMessage = serializeMessage(message, userId);
  emitServiceChatMessageCreated({ conversation: serializedConversation, message: serializedMessage });
  return { message: serializedMessage };
}
