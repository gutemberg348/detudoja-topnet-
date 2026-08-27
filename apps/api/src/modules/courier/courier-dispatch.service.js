import {
  emitCourierRequestCreated,
  emitCourierRequestUpdated,
  emitServiceAvailabilityUpdated,
  emitServiceChatCreated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { sameCity } from "../../utils/location.js";
import { getServiceConversation } from "../service-chats/service-chats.service.js";
import {
  activeCourierConversationStatuses,
  getBusyCourierSellerIds,
  isCourierSellerBusy,
} from "./courier-availability.js";
import { courierRepository, createCourierRepository } from "./courier.repository.js";

const courierRequestLifetimeMs = 24 * 60 * 60 * 1000;

const requestInclude = {
  conversa_servico: { select: { id: true, status: true } },
  loja: { include: { endereco: true } },
  motoboy_aceite: { include: { vendedor: { include: { usuario: { select: { id: true, nome: true } } } } } },
  motoboy_direcionado: { include: { vendedor: { include: { usuario: { select: { id: true, nome: true } } } } } },
  pedido_loja: { select: { codigo: true, id: true } },
  solicitante: {
    include: {
      enderecos: {
        orderBy: [{ principal: "desc" }, { criado_em: "asc" }],
        take: 1,
        where: { excluido_em: null },
      },
    },
  },
  tipo_servico: { include: { segmento_venda: true } },
};

function parseId(value, message) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(message, 400);
  return id;
}

function formatAddress(address) {
  return [
    [address?.rua, address?.numero].filter(Boolean).join(", "),
    address?.bairro,
    [address?.cidade, address?.estado].filter(Boolean).join(" - "),
  ].filter(Boolean).join(" - ");
}

function serializeRequest(request) {
  return {
    acceptedAt: request.aceito_em?.toISOString() ?? null,
    acceptedCourier: request.motoboy_aceite ? {
      id: request.motoboy_aceite.id,
      name: request.motoboy_aceite.nome_exibicao,
      userId: request.motoboy_aceite.vendedor.usuario_id,
    } : null,
    acceptedCourierUserId: request.motoboy_aceite?.vendedor?.usuario_id ?? null,
    conversationId: request.conversa_servico_id,
    conversationStatus: request.conversa_servico?.status ?? null,
    createdAt: request.criado_em.toISOString(),
    description: request.descricao,
    destination: request.destino,
    expiresAt: request.expira_em.toISOString(),
    id: request.id,
    isDirect: request.tipo_chamada === "EQUIPE",
    order: request.pedido_loja ? { code: request.pedido_loja.codigo, id: request.pedido_loja.id } : null,
    origin: request.origem,
    requesterUserId: request.solicitante_usuario_id,
    serviceType: { id: request.tipo_servico.id, name: request.tipo_servico.nome },
    status: request.status,
    store: request.loja ? { id: request.loja.id, name: request.loja.nome } : null,
    storeId: request.loja_id,
    teamCourier: request.motoboy_direcionado ? {
      displayName: request.motoboy_direcionado.nome_exibicao,
      id: request.motoboy_direcionado.id,
    } : null,
    targetedCourier: request.motoboy_direcionado ? {
      id: request.motoboy_direcionado.id,
      name: request.motoboy_direcionado.nome_exibicao,
      userId: request.motoboy_direcionado.vendedor.usuario_id,
    } : null,
    type: request.tipo_chamada,
  };
}

async function accessibleStore(userId, storeId) {
  const store = await courierRepository.findStore({
    include: { endereco: true },
    where: {
      excluido_em: null,
      id: parseId(storeId, "Loja invalida"),
      OR: [
        { lojista: { excluido_em: null, usuario_id: userId } },
        { usuarios: { some: { status: "ATIVO", usuario_id: userId } } },
      ],
    },
  });
  if (!store) throw new AppError("Voce nao possui acesso a esta loja", 403);
  if (!store.endereco) throw new AppError("Cadastre o endereco comercial da loja", 428);
  return store;
}

async function deliveryType(serviceTypeId = null) {
  const types = await courierRepository.findServiceTypes({
    include: { segmento_venda: true },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    where: {
      excluido_em: null,
      ...(serviceTypeId ? { id: parseId(serviceTypeId, "Servico invalido") } : {}),
      status: "ATIVO",
      tipo_operacao: "ENTREGA_LOCAL",
    },
  });
  const type = types.find((item) => item.slug === "motoboy") ?? types[0];
  if (!type?.segmento_venda || type.segmento_venda.status !== "ATIVO") {
    throw new AppError("O servico de motoboy ainda nao esta configurado", 409);
  }
  return type;
}

function platformDispatchEligibility() {
  return {
    OR: [
      { aceita_chamadas_plataforma: true },
      { lojas: { none: { ativo: true } } },
    ],
  };
}

function canReceivePlatformCalls(courier) {
  return courier.aceita_chamadas_plataforma || !(courier.lojas ?? []).some((membership) => membership.ativo);
}

async function onlineCandidates(address, typeId, { excludeStoreTeamId = null } = {}) {
  const services = await courierRepository.findSellerServices({
    include: { vendedor: { include: { motoboy: true, usuario: { select: { id: true } } } } },
    where: {
      disponivel_agora: true,
      excluido_em: null,
      status: "ATIVO",
      tipo_servico_id: typeId,
      vendedor: {
        excluido_em: null,
        motoboy: {
          cidade_base: { equals: address.cidade, mode: "insensitive" },
          estado_base: { equals: address.estado, mode: "insensitive" },
          status: "ATIVO",
          ...platformDispatchEligibility(),
          ...(excludeStoreTeamId ? { lojas: { none: { ativo: true, loja_id: excludeStoreTeamId } } } : {}),
        },
        status: { in: ["ATIVO", "PENDENTE"] },
      },
    },
  });
  const busySellerIds = await getBusyCourierSellerIds(
    courierRepository,
    services.map((service) => service.vendedor_id),
  );
  return services.filter((service) => !busySellerIds.has(service.vendedor_id));
}

async function activeRequestForStore(storeId, userId) {
  return courierRepository.findCourierRequest({
    include: requestInclude,
    orderBy: { criado_em: "desc" },
    where: {
      expira_em: { gt: new Date() },
      loja_id: storeId,
      solicitante_usuario_id: userId,
      status: "PENDENTE",
    },
  });
}

async function activeCustomerRequests(userId, serviceTypeId = null) {
  return courierRepository.findCourierRequests({
    include: requestInclude,
    orderBy: { criado_em: "desc" },
    where: {
      loja_id: null,
      solicitante_usuario_id: userId,
      ...(serviceTypeId ? { tipo_servico_id: parseId(serviceTypeId, "Servico invalido") } : {}),
      OR: [
        { expira_em: { gt: new Date() }, status: "PENDENTE" },
        {
          conversa_servico: {
            is: { status: { in: activeCourierConversationStatuses } },
          },
          status: "ACEITA",
        },
      ],
    },
  });
}

async function expireCourierRequests(where = {}) {
  await courierRepository.updateCourierRequests({
    data: { status: "EXPIRADA" },
    where: { ...where, expira_em: { lte: new Date() }, status: "PENDENTE" },
  });
}

export async function getStoreCourierDispatch(userId, storeId) {
  const store = await accessibleStore(userId, storeId);
  await expireCourierRequests({ loja_id: store.id });
  const type = await deliveryType();
  const [members, candidates, current] = await Promise.all([
    courierRepository.findTeamMembers({
      include: { motoboy: { include: { vendedor: { include: { servicos: true, usuario: { select: { foto_url: true, id: true, nome: true } } } } } } },
      orderBy: { criado_em: "asc" },
      where: { ativo: true, loja_id: store.id },
    }),
    onlineCandidates(store.endereco, type.id, { excludeStoreTeamId: store.id }),
    activeRequestForStore(store.id, userId),
  ]);
  const busySellerIds = await getBusyCourierSellerIds(
    courierRepository,
    members.map((member) => member.motoboy.vendedor_id),
  );
  return {
    currentRequest: current ? serializeRequest(current) : null,
    platformAvailable: candidates.some((candidate) => candidate.vendedor.usuario_id !== userId),
    team: members.map((member) => {
      const service = member.motoboy.vendedor.servicos.find((item) => item.tipo_servico_id === type.id && item.status === "ATIVO");
      const isOnline = member.motoboy.status === "ATIVO" && Boolean(service?.disponivel_agora);
      const isBusy = busySellerIds.has(member.motoboy.vendedor_id);
      return {
        available: isOnline && !isBusy,
        isBusy,
        color: member.motoboy.cor_moto,
        displayName: member.motoboy.nome_exibicao,
        id: member.id,
        isOnline,
        name: member.motoboy.nome_exibicao,
        photoUrl: member.motoboy.vendedor.usuario.foto_url,
        plate: member.motoboy.placa,
        vehicleModel: member.motoboy.modelo_moto,
        vehicle: `${member.motoboy.modelo_moto}${member.motoboy.cor_moto ? ` - ${member.motoboy.cor_moto}` : ""}`,
      };
    }),
  };
}

export async function createCourierRequest(userId, storeId, data) {
  const store = await accessibleStore(userId, storeId);
  await expireCourierRequests({ loja_id: store.id, solicitante_usuario_id: userId });
  const existing = await activeRequestForStore(store.id, userId);
  if (existing) return { request: serializeRequest(existing) };

  const type = await deliveryType();
  let target = null;
  let targetUsers = [];
  if (data.teamMemberId) {
    const member = await courierRepository.findTeamMember({
      include: { motoboy: { include: { vendedor: { include: { servicos: true } } } } },
      where: { ativo: true, id: data.teamMemberId, loja_id: store.id },
    });
    const service = member?.motoboy?.vendedor?.servicos?.find((item) => item.tipo_servico_id === type.id && item.status === "ATIVO" && item.disponivel_agora);
    if (!member || member.motoboy.status !== "ATIVO" || !service) throw new AppError("Este motoboy da equipe esta offline", 409);
    if (await isCourierSellerBusy(courierRepository, member.motoboy.vendedor_id)) {
      throw new AppError("Este motoboy esta atendendo outra corrida", 409);
    }
    target = member.motoboy;
    targetUsers = [member.motoboy.vendedor.usuario_id];
  } else {
    const candidates = await onlineCandidates(store.endereco, type.id, { excludeStoreTeamId: store.id });
    targetUsers = candidates.map((item) => item.vendedor.usuario_id).filter((id) => id !== userId);
    if (!targetUsers.length) throw new AppError("Nenhum motoboy esta disponivel agora", 409);
  }

  let orderId = null;
  if (data.orderId) {
    const order = await courierRepository.findOrder({ where: { id: data.orderId, loja_id: store.id, status: { notIn: ["CANCELADO", "CONCLUIDO"] } } });
    if (!order) throw new AppError("Pedido nao encontrado nesta loja", 404);
    orderId = order.id;
  }
  const created = await courierRepository.createCourierRequest({
    include: requestInclude,
    data: {
      descricao: data.description || null,
      destino: data.destination,
      expira_em: new Date(Date.now() + courierRequestLifetimeMs),
      loja_id: store.id,
      motoboy_direcionado_id: target?.id ?? null,
      origem: data.origin,
      pedido_loja_id: orderId,
      solicitante_usuario_id: userId,
      tipo_chamada: target ? "EQUIPE" : "PLATAFORMA",
      tipo_servico_id: type.id,
    },
  });
  const request = serializeRequest(created);
  emitCourierRequestCreated({ request, targetUserIds: targetUsers });
  return { request };
}

export async function getCustomerCourierRequestState(userId, serviceTypeId = null) {
  await expireCourierRequests({ loja_id: null, solicitante_usuario_id: userId });
  const requests = await activeCustomerRequests(userId, serviceTypeId);
  return { requests: requests.map(serializeRequest) };
}

export async function createCustomerCourierRequest(userId, data) {
  const address = await courierRepository.getUserBaseAddress(userId);
  const type = await deliveryType(data.serviceTypeId);
  await expireCourierRequests({ loja_id: null, solicitante_usuario_id: userId });
  const existing = (await activeCustomerRequests(userId, type.id))[0];
  if (existing) return { request: serializeRequest(existing) };

  const candidates = await onlineCandidates(address, type.id);
  const targetUserIds = candidates
    .map((service) => service.vendedor.usuario_id)
    .filter((candidateUserId) => candidateUserId !== userId);
  if (!targetUserIds.length) throw new AppError("Nenhum motoboy esta disponivel agora", 409);

  const created = await courierRepository.createCourierRequest({
    include: requestInclude,
    data: {
      descricao: data.description || "Quero combinar uma entrega.",
      destino: data.destination || "A combinar no chat",
      expira_em: new Date(Date.now() + courierRequestLifetimeMs),
      origem: data.origin || formatAddress(address) || "A combinar no chat",
      solicitante_usuario_id: userId,
      tipo_chamada: "PLATAFORMA",
      tipo_servico_id: type.id,
    },
  });
  const request = serializeRequest(created);
  emitCourierRequestCreated({ request, targetUserIds });
  return { request };
}

export async function listCourierRequests(userId) {
  await expireCourierRequests();
  const courier = await courierRepository.findCourier({
    include: { lojas: { where: { ativo: true }, select: { ativo: true } }, vendedor: { include: { servicos: true } } },
    where: { status: "ATIVO", vendedor: { excluido_em: null, usuario_id: userId } },
  });
  if (!courier) return { dashboard: null, requests: [] };
  const onlineTypeIds = courier.vendedor.servicos.filter((item) => item.disponivel_agora && item.status === "ATIVO").map((item) => item.tipo_servico_id).filter(Boolean);
  const isBusy = await isCourierSellerBusy(courierRepository, courier.vendedor_id);
  const requests = !onlineTypeIds.length || isBusy ? [] : await courierRepository.findCourierRequests({
    include: requestInclude,
    orderBy: { criado_em: "desc" },
    where: {
      expira_em: { gt: new Date() },
      solicitante_usuario_id: { not: userId },
      status: "PENDENTE",
      tipo_servico_id: { in: onlineTypeIds },
      OR: [
        { motoboy_direcionado_id: courier.id, tipo_chamada: "EQUIPE" },
        ...(canReceivePlatformCalls(courier) ? [{
          tipo_chamada: "PLATAFORMA",
          motoboy_direcionado_id: null,
          loja: {
            is: {
              endereco: {
                is: {
                  cidade: { equals: courier.cidade_base, mode: "insensitive" },
                  estado: { equals: courier.estado_base, mode: "insensitive" },
                },
              },
            },
          },
        }, {
          tipo_chamada: "PLATAFORMA",
          loja_id: null,
          motoboy_direcionado_id: null,
          solicitante: {
            is: {
              enderecos: {
                some: {
                  cidade: { equals: courier.cidade_base, mode: "insensitive" },
                  estado: { equals: courier.estado_base, mode: "insensitive" },
                  excluido_em: null,
                },
              },
            },
          },
        }] : []),
      ],
    },
  });
  const recentRides = await courierRepository.findCourierRequests({
    include: requestInclude,
    orderBy: { atualizado_em: "desc" },
    take: 6,
    where: {
      motoboy_aceite_id: courier.id,
      status: { in: ["ACEITA", "CONCLUIDA", "CANCELADA"] },
    },
  });
  const activeRide = recentRides.find((request) => (
    request.status === "ACEITA"
    && activeCourierConversationStatuses.includes(request.conversa_servico?.status)
  ));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [completedToday, totalDeliveries] = await Promise.all([
    courierRepository.countCourierRequests({
      where: {
        atualizado_em: { gte: today },
        motoboy_aceite_id: courier.id,
        status: "CONCLUIDA",
      },
    }),
    courierRepository.countCourierRequests({
      where: { motoboy_aceite_id: courier.id, status: "CONCLUIDA" },
    }),
  ]);

  return {
    dashboard: {
      completedToday,
      currentRide: activeRide ? serializeRequest(activeRide) : null,
      linkedStoreCount: courier.lojas.length,
      operationalStatus: isBusy ? "BUSY" : onlineTypeIds.length ? "AVAILABLE" : "OFFLINE",
      recentRides: recentRides
        .filter((request) => request.id !== activeRide?.id)
        .map(serializeRequest),
      totalDeliveries,
    },
    requests: requests.map(serializeRequest),
  };
}

export async function acceptCourierRequest(userId, requestId) {
  const id = parseId(requestId, "Chamada invalida");
  await expireCourierRequests({ id });
  const courier = await courierRepository.findCourier({
    include: { lojas: { where: { ativo: true }, select: { ativo: true } }, vendedor: { include: { servicos: { include: { tipo_servico: { include: { segmento_venda: true } } } } } } },
    where: { status: "ATIVO", vendedor: { excluido_em: null, usuario_id: userId } },
  });
  if (!courier) throw new AppError("Cadastre seu perfil de motoboy", 428);
  const original = await courierRepository.findCourierRequestById({ include: requestInclude, where: { id } });
  if (!original || original.status !== "PENDENTE" || original.expira_em <= new Date()) throw new AppError("Esta chamada nao esta mais disponivel", 409);
  if (original.solicitante_usuario_id === userId) throw new AppError("Voce nao pode aceitar a propria chamada", 400);
  if (!sameCity(
    { city: courier.cidade_base, state: courier.estado_base },
    original.loja?.endereco ?? original.solicitante.enderecos[0],
  )) throw new AppError("Esta corrida pertence a outra cidade", 403);
  if (original.tipo_chamada === "EQUIPE" && original.motoboy_direcionado_id !== courier.id) throw new AppError("Esta chamada pertence a outro motoboy", 403);
  if (original.tipo_chamada === "PLATAFORMA") {
    if (!canReceivePlatformCalls(courier)) throw new AppError("Sua disponibilidade esta limitada as lojas credenciadas", 409);
  }
  const sellerService = courier.vendedor.servicos.find((item) => item.tipo_servico_id === original.tipo_servico_id && item.status === "ATIVO" && item.disponivel_agora);
  const segment = sellerService?.tipo_servico?.segmento_venda;
  if (!sellerService || !segment || segment.status !== "ATIVO") throw new AppError("Voce esta offline para esta entrega", 409);

  const result = await courierRepository.transaction(async (database) => {
    const repository = createCourierRepository(database);
    await repository.lockCourier(courier.id);
    if (await isCourierSellerBusy(repository, courier.vendedor_id)) {
      throw new AppError("Voce ja esta atendendo outra corrida", 409);
    }
    const claimed = await repository.updateCourierRequests({
      data: { aceito_em: new Date(), motoboy_aceite_id: courier.id, status: "ACEITA" },
      where: { expira_em: { gt: new Date() }, id, status: "PENDENTE" },
    });
    if (claimed.count !== 1) throw new AppError("Outro motoboy ja aceitou esta chamada", 409);
    const conversation = await repository.createServiceConversation({
      data: {
        cliente_usuario_id: original.solicitante_usuario_id,
        descricao_inicial: original.descricao,
        destino: original.destino,
        loja_solicitante_id: original.loja_id,
        mensagens: { create: { lido_vendedor_em: new Date(), mensagem: `Corrida aceita. Retirada: ${original.origem}. Destino: ${original.destino}.${original.descricao ? ` Detalhes: ${original.descricao}` : ""}`, origem: "SISTEMA" } },
        origem: original.origem,
        pedido_loja_id: original.pedido_loja_id,
        segmento_venda_id: segment.id,
        servico_vendedor_id: sellerService.id,
        vendedor_id: courier.vendedor_id,
      },
    });
    return repository.updateCourierRequest({ include: requestInclude, data: { conversa_servico_id: conversation.id }, where: { id } });
  });
  const response = await getServiceConversation(userId, result.conversa_servico_id);
  const candidates = original.tipo_chamada === "PLATAFORMA"
    ? await onlineCandidates(
        original.loja?.endereco ?? original.solicitante.enderecos[0],
        original.tipo_servico_id,
        { excludeStoreTeamId: original.loja_id },
      )
    : [];
  emitServiceChatCreated(response.conversation);
  emitServiceAvailabilityUpdated({
    available: false,
    sellerId: courier.vendedor_id,
    sellerUserId: userId,
    serviceTypeId: original.tipo_servico_id,
  });
  emitCourierRequestUpdated({
    request: serializeRequest(result),
    targetUserIds: candidates.map((item) => item.vendedor.usuario_id),
  });
  return { conversation: response.conversation, request: serializeRequest(result) };
}

export async function cancelCourierRequest(userId, requestId) {
  const id = parseId(requestId, "Chamada invalida");
  const original = await courierRepository.findCourierRequest({ include: requestInclude, where: { id, solicitante_usuario_id: userId } });
  if (!original) throw new AppError("Chamada nao encontrada", 404);
  if (original.status !== "PENDENTE") throw new AppError("Esta chamada nao pode mais ser cancelada", 409);
  const candidates = original.tipo_chamada === "PLATAFORMA"
    ? await onlineCandidates(
        original.loja?.endereco ?? original.solicitante.enderecos[0],
        original.tipo_servico_id,
        { excludeStoreTeamId: original.loja_id },
      )
    : [];
  const updated = await courierRepository.updateCourierRequest({ include: requestInclude, data: { cancelado_em: new Date(), status: "CANCELADA" }, where: { id } });
  emitCourierRequestUpdated({
    request: serializeRequest(updated),
    targetUserIds: [
      original.motoboy_direcionado?.vendedor?.usuario_id,
      ...candidates.map((item) => item.vendedor.usuario_id),
    ],
  });
  return { request: serializeRequest(updated) };
}
