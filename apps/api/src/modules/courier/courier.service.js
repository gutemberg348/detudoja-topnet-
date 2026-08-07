import { prisma } from "../../config/prisma.js";
import { emitCourierTeamUpdated } from "../../realtime/socket.server.js";
import { AppError } from "../../utils/errors.js";
import { isValidCpf, normalizeCpf } from "../../utils/cpf.js";
import { requireUserBaseAddress, sameCity } from "../../utils/location.js";

function serializeCourierProfile(profile) {
  if (!profile) return null;

  return {
    baseCity: profile.cidade_base,
    baseState: profile.estado_base,
    color: profile.cor_moto,
    contactPhone: profile.telefone_contato,
    createdAt: profile.criado_em.toISOString(),
    displayName: profile.nome_exibicao,
    driverLicense: profile.cnh,
    id: profile.id,
    plate: profile.placa,
    rating: Number(profile.avaliacao_media ?? 0),
    serviceRadiusKm: profile.raio_atendimento_km,
    status: profile.status,
    totalDeliveries: profile.total_entregas,
    updatedAt: profile.atualizado_em.toISOString(),
    vehicleModel: profile.modelo_moto,
  };
}

function parsePositiveId(value, message) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(message, 400);
  return id;
}

function matchesStoreCity(courier, address) {
  return sameCity(
    { city: courier?.cidade_base, state: courier?.estado_base },
    address,
  );
}

async function findAccessibleStore(userId, storeId, { manageTeam = false } = {}) {
  const id = parsePositiveId(storeId, "Loja invalida");
  const store = await prisma.loja.findFirst({
    select: { endereco: { select: { cidade: true, estado: true } }, id: true, nome: true },
    where: {
      excluido_em: null,
      id,
      OR: [
        { lojista: { excluido_em: null, usuario_id: userId } },
        {
          usuarios: {
            some: {
              ...(manageTeam ? { cargo: { in: ["DONO", "GERENTE"] } } : {}),
              status: "ATIVO",
              usuario_id: userId,
            },
          },
        },
      ],
    },
  });

  if (!store) throw new AppError("Voce nao possui acesso a esta loja", 403);
  return store;
}

const teamMemberInclude = {
  motoboy: {
    include: {
      vendedor: {
        include: {
          servicos: {
            include: { tipo_servico: true },
            where: {
              excluido_em: null,
              status: "ATIVO",
              tipo_servico: {
                excluido_em: null,
                status: "ATIVO",
                tipo_operacao: "ENTREGA_LOCAL",
              },
            },
          },
          usuario: { select: { foto_url: true, id: true, nome: true } },
        },
      },
    },
  },
};

function serializeTeamMember(member) {
  const courier = member.motoboy;
  const services = courier.vendedor.servicos ?? [];
  const preferredService = services.find((service) => service.tipo_servico.slug === "motoboy" && service.disponivel_agora)
    ?? services.find((service) => service.disponivel_agora)
    ?? services.find((service) => service.tipo_servico.slug === "motoboy")
    ?? services[0]
    ?? null;
  const isOnline = courier.status === "ATIVO" && Boolean(preferredService?.disponivel_agora);

  return {
    courier: {
      color: courier.cor_moto,
      baseCity: courier.cidade_base,
      baseState: courier.estado_base,
      displayName: courier.nome_exibicao,
      id: courier.id,
      isOnline,
      name: courier.vendedor.nome_publico || courier.vendedor.usuario.nome,
      photoUrl: courier.vendedor.usuario.foto_url,
      plate: courier.placa,
      rating: Number(courier.avaliacao_media ?? 0),
      sellerId: courier.vendedor.id,
      sellerServiceId: isOnline ? preferredService.id : null,
      serviceRadiusKm: courier.raio_atendimento_km,
      status: courier.status,
      totalDeliveries: courier.total_entregas,
      userId: courier.vendedor.usuario_id,
      vehicleModel: courier.modelo_moto,
    },
    id: member.id,
    linkedAt: member.criado_em.toISOString(),
  };
}

async function findTeamMember(memberId) {
  return prisma.motoboyLoja.findUnique({
    include: teamMemberInclude,
    where: { id: memberId },
  });
}

export async function getCourierProfile(userId) {
  const profile = await prisma.motoboy.findFirst({
    where: { vendedor: { excluido_em: null, usuario_id: userId } },
  });

  return { profile: serializeCourierProfile(profile) };
}

export async function saveCourierProfile(userId, data) {
  const seller = await prisma.vendedor.findFirst({
    include: { usuario: { select: { cpf: true } } },
    where: { excluido_em: null, usuario_id: userId },
  });

  if (!seller) {
    throw new AppError("Crie seu cadastro comercial antes do perfil de motoboy", 428);
  }

  if (["BLOQUEADO", "REPROVADO"].includes(seller.status)) {
    throw new AppError("Seu cadastro comercial nao pode operar entregas", 403);
  }

  const cpf = normalizeCpf(seller.cpf || seller.usuario.cpf || "");
  if (!isValidCpf(cpf)) {
    throw new AppError("Confirme um CPF valido na sua conta antes de cadastrar o motoboy", 428);
  }

  const baseAddress = await requireUserBaseAddress(prisma, userId);
  if (!sameCity(baseAddress, { city: data.baseCity, state: data.baseState })) {
    throw new AppError("O motoboy atende somente a cidade-base da sua conta", 409);
  }

  let profile;
  try {
    profile = await prisma.motoboy.upsert({
      create: {
        cnh: data.driverLicense,
        cidade_base: data.baseCity,
        cor_moto: data.color,
        estado_base: data.baseState,
        modelo_moto: data.vehicleModel,
        nome_exibicao: data.displayName,
        placa: data.plate,
        raio_atendimento_km: data.serviceRadiusKm,
        status: "ATIVO",
        telefone_contato: data.contactPhone,
        vendedor_id: seller.id,
      },
      update: {
        cnh: data.driverLicense,
        cidade_base: data.baseCity,
        cor_moto: data.color,
        estado_base: data.baseState,
        modelo_moto: data.vehicleModel,
        nome_exibicao: data.displayName,
        placa: data.plate,
        raio_atendimento_km: data.serviceRadiusKm,
        status: "ATIVO",
        telefone_contato: data.contactPhone,
      },
      where: { vendedor_id: seller.id },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("A CNH ou placa informada ja pertence a outro cadastro", 409);
    }
    throw error;
  }

  return { profile: serializeCourierProfile(profile) };
}

export async function listStoreCourierTeam(userId, storeId) {
  const store = await findAccessibleStore(userId, storeId);
  const members = await prisma.motoboyLoja.findMany({
    include: teamMemberInclude,
    orderBy: [{ criado_em: "asc" }],
    where: { ativo: true, loja_id: store.id },
  });

  return {
    members: members.map(serializeTeamMember),
    store: { id: store.id, name: store.nome },
  };
}

export async function addStoreCourier(userId, storeId, data) {
  const store = await findAccessibleStore(userId, storeId, { manageTeam: true });
  const teamSize = await prisma.motoboyLoja.count({
    where: { ativo: true, loja_id: store.id },
  });
  if (teamSize >= 30) throw new AppError("Esta loja atingiu o limite de 30 motoboys", 409);

  const courier = await prisma.motoboy.findFirst({
    include: { vendedor: { select: { usuario_id: true } } },
    where: {
      status: { not: "BLOQUEADO" },
      telefone_contato: data.contactPhone,
      vendedor: { excluido_em: null, status: { in: ["ATIVO", "PENDENTE"] } },
    },
  });
  if (!courier) {
    throw new AppError("Nenhum motoboy cadastrado foi encontrado com este telefone", 404);
  }
  if (!store.endereco) {
    throw new AppError("Cadastre o CEP e endereco comercial da loja antes de montar a equipe", 428);
  }
  if (!matchesStoreCity(courier, store.endereco)) {
    throw new AppError("Este motoboy possui base em outra cidade e nao pode entrar nesta equipe", 409);
  }
  if (courier.vendedor.usuario_id === userId) {
    throw new AppError("Use outro motoboy: voce nao pode chamar o proprio perfil", 409);
  }

  const member = await prisma.motoboyLoja.upsert({
    create: { loja_id: store.id, motoboy_id: courier.id },
    update: { ativo: true },
    where: { loja_id_motoboy_id: { loja_id: store.id, motoboy_id: courier.id } },
  });
  const completeMember = await findTeamMember(member.id);

  emitCourierTeamUpdated({ courierUserId: courier.vendedor.usuario_id, storeId: store.id });
  return { member: serializeTeamMember(completeMember) };
}

export async function removeStoreCourier(userId, storeId, memberId) {
  const store = await findAccessibleStore(userId, storeId, { manageTeam: true });
  const id = parsePositiveId(memberId, "Motoboy da equipe invalido");
  const member = await prisma.motoboyLoja.findFirst({
    include: { motoboy: { include: { vendedor: { select: { usuario_id: true } } } } },
    where: { id, loja_id: store.id },
  });
  if (!member) throw new AppError("Motoboy nao encontrado nesta equipe", 404);

  await prisma.motoboyLoja.delete({ where: { id: member.id } });
  emitCourierTeamUpdated({ courierUserId: member.motoboy.vendedor.usuario_id, storeId: store.id });
  return { removed: true };
}
