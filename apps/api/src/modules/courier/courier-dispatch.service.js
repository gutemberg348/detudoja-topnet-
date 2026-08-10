import { prisma } from "../../config/prisma.js";
import {
  emitCourierRequestCreated,
  emitCourierRequestUpdated,
  emitServiceChatCreated,
} from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { sameCity } from "../../utils/location.js";
import { getServiceConversation } from "../service-chats/service-chats.service.js";

const requestInclude = {
  conversa_servico: { select: { id: true } },
  loja: { include: { endereco: true } },
  motoboy_aceite: { include: { vendedor: { include: { usuario: { select: { id: true, nome: true } } } } } },
  motoboy_direcionado: { include: { vendedor: { include: { usuario: { select: { id: true, nome: true } } } } } },
  pedido_loja: { select: { codigo: true, id: true } },
  tipo_servico: { include: { segmento_venda: true } },
};

function parseId(value, message) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(message, 400);
  return id;
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
    store: { id: request.loja.id, name: request.loja.nome },
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
  const store = await prisma.loja.findFirst({
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

async function deliveryType() {
  const types = await prisma.tipoServico.findMany({
    include: { segmento_venda: true },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    where: { excluido_em: null, status: "ATIVO", tipo_operacao: "ENTREGA_LOCAL" },
  });
  const type = types.find((item) => item.slug === "motoboy") ?? types[0];
  if (!type?.segmento_venda || type.segmento_venda.status !== "ATIVO") {
    throw new AppError("O servico de motoboy ainda nao esta configurado", 409);
  }
  return type;
}

async function onlineCandidates(store, typeId, { excludeTeam = false } = {}) {
  return prisma.servicoVendedor.findMany({
    include: { vendedor: { include: { motoboy: true, usuario: { select: { id: true } } } } },
    where: {
      disponivel_agora: true,
      excluido_em: null,
      status: "ATIVO",
      tipo_servico_id: typeId,
      vendedor: {
        excluido_em: null,
        motoboy: {
          cidade_base: { equals: store.endereco.cidade, mode: "insensitive" },
          estado_base: { equals: store.endereco.estado, mode: "insensitive" },
          status: "ATIVO",
          ...(excludeTeam ? { lojas: { none: { ativo: true, loja_id: store.id } } } : {}),
        },
        status: { in: ["ATIVO", "PENDENTE"] },
      },
    },
  });
}

async function activeRequestForStore(storeId, userId) {
  return prisma.solicitacaoMotoboy.findFirst({
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

async function expireCourierRequests(where = {}) {
  await prisma.solicitacaoMotoboy.updateMany({
    data: { status: "EXPIRADA" },
    where: { ...where, expira_em: { lte: new Date() }, status: "PENDENTE" },
  });
}

export async function getStoreCourierDispatch(userId, storeId) {
  const store = await accessibleStore(userId, storeId);
  await expireCourierRequests({ loja_id: store.id });
  const type = await deliveryType();
  const [members, candidates, current] = await Promise.all([
    prisma.motoboyLoja.findMany({
      include: { motoboy: { include: { vendedor: { include: { servicos: true, usuario: { select: { foto_url: true, id: true, nome: true } } } } } } },
      orderBy: { criado_em: "asc" },
      where: { ativo: true, loja_id: store.id },
    }),
    onlineCandidates(store, type.id, { excludeTeam: true }),
    activeRequestForStore(store.id, userId),
  ]);
  return {
    currentRequest: current ? serializeRequest(current) : null,
    platformAvailable: candidates.some((candidate) => candidate.vendedor.usuario_id !== userId),
    team: members.map((member) => {
      const service = member.motoboy.vendedor.servicos.find((item) => item.tipo_servico_id === type.id && item.status === "ATIVO");
      return {
        available: member.motoboy.status === "ATIVO" && Boolean(service?.disponivel_agora),
        color: member.motoboy.cor_moto,
        displayName: member.motoboy.nome_exibicao,
        id: member.id,
        isOnline: member.motoboy.status === "ATIVO" && Boolean(service?.disponivel_agora),
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
    const member = await prisma.motoboyLoja.findFirst({
      include: { motoboy: { include: { vendedor: { include: { servicos: true } } } } },
      where: { ativo: true, id: data.teamMemberId, loja_id: store.id },
    });
    const service = member?.motoboy?.vendedor?.servicos?.find((item) => item.tipo_servico_id === type.id && item.status === "ATIVO" && item.disponivel_agora);
    if (!member || member.motoboy.status !== "ATIVO" || !service) throw new AppError("Este motoboy da equipe esta offline", 409);
    target = member.motoboy;
    targetUsers = [member.motoboy.vendedor.usuario_id];
  } else {
    const candidates = await onlineCandidates(store, type.id, { excludeTeam: true });
    targetUsers = candidates.map((item) => item.vendedor.usuario_id).filter((id) => id !== userId);
    if (!targetUsers.length) throw new AppError("Nenhum motoboy esta disponivel agora", 409);
  }

  let orderId = null;
  if (data.orderId) {
    const order = await prisma.pedidoLoja.findFirst({ where: { id: data.orderId, loja_id: store.id, status: { notIn: ["CANCELADO", "CONCLUIDO"] } } });
    if (!order) throw new AppError("Pedido nao encontrado nesta loja", 404);
    orderId = order.id;
  }
  const created = await prisma.solicitacaoMotoboy.create({
    include: requestInclude,
    data: {
      descricao: data.description || null,
      destino: data.destination,
      expira_em: new Date(Date.now() + 5 * 60 * 1000),
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

export async function listCourierRequests(userId) {
  await expireCourierRequests();
  const courier = await prisma.motoboy.findFirst({
    include: { vendedor: { include: { servicos: true } } },
    where: { status: "ATIVO", vendedor: { excluido_em: null, usuario_id: userId } },
  });
  if (!courier) return { requests: [] };
  const onlineTypeIds = courier.vendedor.servicos.filter((item) => item.disponivel_agora && item.status === "ATIVO").map((item) => item.tipo_servico_id).filter(Boolean);
  if (!onlineTypeIds.length) return { requests: [] };
  const requests = await prisma.solicitacaoMotoboy.findMany({
    include: requestInclude,
    orderBy: { criado_em: "desc" },
    where: {
      expira_em: { gt: new Date() },
      solicitante_usuario_id: { not: userId },
      status: "PENDENTE",
      tipo_servico_id: { in: onlineTypeIds },
      OR: [
        { motoboy_direcionado_id: courier.id, tipo_chamada: "EQUIPE" },
        {
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
              motoboys_equipe: { none: { ativo: true, motoboy_id: courier.id } },
            },
          },
        },
      ],
    },
  });
  return { requests: requests.map(serializeRequest) };
}

export async function acceptCourierRequest(userId, requestId) {
  const id = parseId(requestId, "Chamada invalida");
  await expireCourierRequests({ id });
  const courier = await prisma.motoboy.findFirst({
    include: { vendedor: { include: { servicos: { include: { tipo_servico: { include: { segmento_venda: true } } } } } } },
    where: { status: "ATIVO", vendedor: { excluido_em: null, usuario_id: userId } },
  });
  if (!courier) throw new AppError("Cadastre seu perfil de motoboy", 428);
  const original = await prisma.solicitacaoMotoboy.findUnique({ include: requestInclude, where: { id } });
  if (!original || original.status !== "PENDENTE" || original.expira_em <= new Date()) throw new AppError("Esta chamada nao esta mais disponivel", 409);
  if (original.solicitante_usuario_id === userId) throw new AppError("Voce nao pode aceitar a propria chamada", 400);
  if (!sameCity(
    { city: courier.cidade_base, state: courier.estado_base },
    original.loja.endereco,
  )) throw new AppError("Esta corrida pertence a outra cidade", 403);
  if (original.tipo_chamada === "EQUIPE" && original.motoboy_direcionado_id !== courier.id) throw new AppError("Esta chamada pertence a outro motoboy", 403);
  if (original.tipo_chamada === "PLATAFORMA") {
    const linked = await prisma.motoboyLoja.findFirst({ where: { ativo: true, loja_id: original.loja_id, motoboy_id: courier.id } });
    if (linked) throw new AppError("Use a chamada direta da equipe desta loja", 409);
  }
  const sellerService = courier.vendedor.servicos.find((item) => item.tipo_servico_id === original.tipo_servico_id && item.status === "ATIVO" && item.disponivel_agora);
  const segment = sellerService?.tipo_servico?.segmento_venda;
  if (!sellerService || !segment || segment.status !== "ATIVO") throw new AppError("Voce esta offline para esta entrega", 409);

  const result = await prisma.$transaction(async (database) => {
    const claimed = await database.solicitacaoMotoboy.updateMany({
      data: { aceito_em: new Date(), motoboy_aceite_id: courier.id, status: "ACEITA" },
      where: { expira_em: { gt: new Date() }, id, status: "PENDENTE" },
    });
    if (claimed.count !== 1) throw new AppError("Outro motoboy ja aceitou esta chamada", 409);
    const conversation = await database.conversaServico.create({
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
    return database.solicitacaoMotoboy.update({ include: requestInclude, data: { conversa_servico_id: conversation.id }, where: { id } });
  });
  const response = await getServiceConversation(userId, result.conversa_servico_id);
  const candidates = original.tipo_chamada === "PLATAFORMA"
    ? await onlineCandidates(original.loja, original.tipo_servico_id, { excludeTeam: true })
    : [];
  emitServiceChatCreated(response.conversation);
  emitCourierRequestUpdated({
    request: serializeRequest(result),
    targetUserIds: candidates.map((item) => item.vendedor.usuario_id),
  });
  return { conversation: response.conversation, request: serializeRequest(result) };
}

export async function cancelCourierRequest(userId, requestId) {
  const id = parseId(requestId, "Chamada invalida");
  const original = await prisma.solicitacaoMotoboy.findFirst({ include: requestInclude, where: { id, solicitante_usuario_id: userId } });
  if (!original) throw new AppError("Chamada nao encontrada", 404);
  if (original.status !== "PENDENTE") throw new AppError("Esta chamada nao pode mais ser cancelada", 409);
  const candidates = original.tipo_chamada === "PLATAFORMA"
    ? await onlineCandidates(original.loja, original.tipo_servico_id, { excludeTeam: true })
    : [];
  const updated = await prisma.solicitacaoMotoboy.update({ include: requestInclude, data: { cancelado_em: new Date(), status: "CANCELADA" }, where: { id } });
  emitCourierRequestUpdated({
    request: serializeRequest(updated),
    targetUserIds: [
      original.motoboy_direcionado?.vendedor?.usuario_id,
      ...candidates.map((item) => item.vendedor.usuario_id),
    ],
  });
  return { request: serializeRequest(updated) };
}
