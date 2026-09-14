import argon2 from "argon2";
import { AppError } from "../../utils/errors.js";
import { isValidCpf } from "../../utils/cpf.js";
import { parsePositiveId } from "../../utils/ids.js";
import { getPagination } from "../../utils/pagination.js";
import { serializeAdminUser } from "./admin.serializer.js";
import { adjustUserWallet } from "../wallet/wallet.service.js";
import { adminUsersRepository } from "./admin-users.repository.js";

const validStatuses = new Set(["ATIVO", "INATIVO", "BLOQUEADO", "PENDENTE"]);
const validKycStatuses = new Set([
  "PENDENTE",
  "EM_ANALISE",
  "APROVADO",
  "REPROVADO",
  "BLOQUEADO",
]);

const participantWhere = {
  excluido_em: null,
  tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
};

const providerInclude = {
  kyc: { select: { status: true } },
  vendedor: { include: { motoboy: true } },
};

async function findProviderParticipant(database, userId) {
  const user = await database.usuario.findFirst({
    include: providerInclude,
    where: { ...participantWhere, id: userId },
  });
  if (!user) throw new AppError("Participante nao encontrado", 404);
  return user;
}

function assertProviderEligible(user) {
  if (user.status !== "ATIVO") {
    throw new AppError("Ative a conta do participante antes de liberar operacao comercial", 409);
  }
  if (user.kyc?.status !== "APROVADO") {
    throw new AppError("O participante precisa ter KYC aprovado", 428);
  }
}

function assertActiveSeller(seller) {
  if (!seller || seller.excluido_em) {
    throw new AppError("Este participante ainda nao possui perfil de prestador", 409);
  }
  if (seller.status !== "ATIVO" || seller.status_kyc !== "APROVADO") {
    throw new AppError("Ative o prestador e regularize o KYC antes de liberar servicos", 409);
  }
}

function buildUserWhere(query) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const kycStatus = String(query.kycStatus ?? "").toUpperCase();

  return {
    excluido_em: null,
    tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
    ...(validStatuses.has(status) ? { status } : {}),
    ...(validKycStatuses.has(kycStatus)
      ? { kyc: { is: { status: kycStatus } } }
      : {}),
    ...(search
      ? {
          OR: [
            { nome: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { telefone: { contains: search.replace(/\D/g, "") } },
            { cpf: { contains: search.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };
}

export async function listAdminUsers(query) {
  const { page, perPage } = getPagination(query);
  const where = buildUserWhere(query);
  const [total, users] = await Promise.all([
    adminUsersRepository.count(where),
    adminUsersRepository.list({ page, perPage, where }),
  ]);

  return {
    pagination: {
      page,
      pages: Math.max(Math.ceil(total / perPage), 1),
      perPage,
      total,
    },
    users: users.map(serializeAdminUser),
  };
}

export async function getAdminUser(userId) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const user = await adminUsersRepository.findParticipant(parsedUserId);

  if (!user) {
    throw new AppError("Participante nao encontrado", 404);
  }

  return { user: serializeAdminUser(user, { includeSensitive: true }) };
}

export async function updateAdminUserStatus(adminId, userId, status) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    await database.usuario.update({ data: { status }, where: { id: user.id } });

    if (status !== "ATIVO" && user.vendedor && !user.vendedor.excluido_em) {
      await Promise.all([
        database.vendedor.update({ data: { status: "PAUSADO" }, where: { id: user.vendedor.id } }),
        database.servicoVendedor.updateMany({
          data: { disponivel_agora: false },
          where: { vendedor_id: user.vendedor.id },
        }),
        database.motoboy.updateMany({
          data: { aceita_chamadas_plataforma: false, status: "PAUSADO" },
          where: { vendedor_id: user.vendedor.id, status: { not: "BLOQUEADO" } },
        }),
      ]);
    }
    await adminUsersRepository.createAudit(database, {
      acao: "CONTA_PARTICIPANTE_ATUALIZADA",
      administrador_id: adminId,
      dados_json: { status },
      usuario_alvo_id: user.id,
    });
  });

  return getAdminUser(parsedUserId);
}

export async function updateAdminUser(userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const exists = await adminUsersRepository.findParticipantId(parsedUserId);

  if (!exists) {
    throw new AppError("Participante nao encontrado", 404);
  }

  await adminUsersRepository.update(parsedUserId, {
    ...(data.cpf !== undefined ? { cpf: data.cpf.replace(/\D/g, "") || null } : {}),
    ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
    ...(data.name !== undefined ? { nome: data.name.trim() } : {}),
    ...(data.phone !== undefined ? { telefone: data.phone.replace(/\D/g, "") || null } : {}),
  });

  return getAdminUser(parsedUserId);
}

export async function approveAdminUserKycWithoutSubmission(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await database.usuario.findFirst({
      include: { kyc: { include: { solicitacoes: { select: { id: true }, take: 1 } } } },
      where: { ...participantWhere, id: parsedUserId },
    });
    if (!user) throw new AppError("Participante nao encontrado", 404);
    if (user.kyc?.solicitacoes.length) {
      throw new AppError("Este participante possui documentos; use a decisao do envio KYC", 409);
    }
    if (!user.cpf || !isValidCpf(user.cpf)) {
      throw new AppError("Cadastre um CPF valido antes de liberar o KYC", 428);
    }
    const now = new Date();
    await database.kycUsuario.upsert({
      create: {
        cpf: user.cpf,
        nome_completo: user.nome,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: user.id,
        validado_em: now,
      },
      update: {
        cpf: user.cpf,
        motivo_reprovacao: null,
        nome_completo: user.nome,
        status: "APROVADO",
        validado_em: now,
      },
      where: { usuario_id: user.id },
    });
    await Promise.all([
      database.usuario.update({ data: { nivel_kyc: "TIER_2" }, where: { id: user.id } }),
      database.lojista.updateMany({
        data: { status: "ATIVO", status_kyc: "APROVADO" },
        where: { tipo_pessoa: "FISICA", usuario_id: user.id },
      }),
      database.vendedor.updateMany({
        data: { status: "ATIVO", status_kyc: "APROVADO" },
        where: { tipo_pessoa: "FISICA", usuario_id: user.id },
      }),
      database.indicacao.updateMany({
        data: { status: "ATIVA" },
        where: { indicado_usuario_id: user.id, status: "PENDENTE" },
      }),
    ]);
    await adminUsersRepository.createAudit(database, {
      acao: "KYC_APROVADO_SEM_DOCUMENTOS",
      administrador_id: adminId,
      dados_json: { motivo: data.reason, tier: "TIER_2" },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function updateAdminUserPassword(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const passwordHash = await argon2.hash(data.password, {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
  });
  await adminUsersRepository.transaction(async (database) => {
    const user = await database.usuario.findFirst({ where: { ...participantWhere, id: parsedUserId } });
    if (!user) throw new AppError("Participante nao encontrado", 404);
    const now = new Date();
    await Promise.all([
      database.usuario.update({ data: { senha_hash: passwordHash }, where: { id: user.id } }),
      database.sessaoAutenticacao.updateMany({
        data: { revogada_em: now },
        where: { revogada_em: null, usuario_id: user.id },
      }),
    ]);
    await adminUsersRepository.createAudit(database, {
      acao: "SENHA_PARTICIPANTE_REDEFINIDA",
      administrador_id: adminId,
      dados_json: { motivo: data.reason, sessoesRevogadasEm: now.toISOString() },
      usuario_alvo_id: user.id,
    });
  });
  return { updated: true };
}

export async function updateAdminPayoutAccount(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    const account = await database.contaBancaria.findFirst({
      orderBy: [{ principal: "desc" }, { atualizado_em: "desc" }],
      where: { excluido_em: null, usuario_id: user.id },
    });
    if (!account?.chave_pix || !account.tipo_chave) {
      throw new AppError("O participante ainda nao cadastrou uma chave Pix", 409);
    }
    if (data.status === "ATIVA" && user.status !== "ATIVO") {
      throw new AppError("Ative a conta do participante antes de liberar a chave Pix", 409);
    }

    if (data.status === "ATIVA") {
      await database.contaBancaria.updateMany({
        data: { principal: false },
        where: { id: { not: account.id }, principal: true, usuario_id: user.id },
      });
    }
    await database.contaBancaria.update({
      data: {
        principal: true,
        provedor_validacao: data.status === "ATIVA" ? "ADMIN_MANUAL" : account.provedor_validacao,
        status: data.status,
        validado_em: data.status === "ATIVA" ? new Date() : null,
      },
      where: { id: account.id },
    });
    await adminUsersRepository.createAudit(database, {
      acao: "CHAVE_PIX_STATUS_ATUALIZADO",
      administrador_id: adminId,
      dados_json: {
        contaBancariaId: account.id,
        motivo: data.reason,
        statusAnterior: account.status,
        statusNovo: data.status,
      },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function creditAdminUserWallet(adminId, userId, data) {
  return adjustAdminUserWallet(adminId, userId, { ...data, operation: "CREDIT" });
}

export async function adjustAdminUserWallet(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const exists = await adminUsersRepository.findParticipantId(parsedUserId);

  if (!exists) {
    throw new AppError("Participante nao encontrado", 404);
  }

  await adminUsersRepository.transaction(async (database) => {
    await adjustUserWallet({
      adminId,
      database,
      description: data.description,
      operation: data.operation,
      userId: parsedUserId,
      valueCents: data.valueCents,
      walletCode: data.walletCode,
    });
  });

  return getAdminUser(parsedUserId);
}

export async function updateAdminSellerProfile(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    const seller = user.vendedor;
    if (!seller || seller.excluido_em) {
      throw new AppError("Este participante ainda nao possui perfil de prestador", 409);
    }
    if (data.status === "ATIVO") assertProviderEligible(user);

    await database.vendedor.update({ data: { status: data.status }, where: { id: seller.id } });
    if (data.status !== "ATIVO") {
      await database.servicoVendedor.updateMany({
        data: { disponivel_agora: false },
        where: { vendedor_id: seller.id },
      });
    }
    await adminUsersRepository.createAudit(database, {
      acao: "PERFIL_PRESTADOR_ATUALIZADO",
      administrador_id: adminId,
      dados_json: { status: data.status, vendedorId: seller.id },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function updateAdminCourierProfile(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    const seller = user.vendedor;
    if (!seller || seller.excluido_em) {
      throw new AppError("Este participante ainda nao possui perfil de prestador", 409);
    }
    const courier = seller.motoboy;
    if (!courier) throw new AppError("Este prestador nao possui cadastro de motoboy", 409);

    const nextStatus = data.status ?? courier.status;
    const nextAcceptsPlatformCalls = data.acceptsPlatformCalls ?? courier.aceita_chamadas_plataforma;
    if (nextStatus === "ATIVO" || nextAcceptsPlatformCalls) {
      assertActiveSeller(seller);
      assertProviderEligible(user);
    }

    await database.motoboy.update({
      data: {
        aceita_chamadas_plataforma: nextStatus === "ATIVO" ? nextAcceptsPlatformCalls : false,
        status: nextStatus,
      },
      where: { id: courier.id },
    });
    if (nextStatus !== "ATIVO") {
      await database.servicoVendedor.updateMany({
        data: { disponivel_agora: false },
        where: { tipo_servico: { tipo_operacao: "ENTREGA_LOCAL" }, vendedor_id: seller.id },
      });
    }
    await adminUsersRepository.createAudit(database, {
      acao: "PERFIL_MOTOBOY_ATUALIZADO",
      administrador_id: adminId,
      dados_json: { acceptsPlatformCalls: nextAcceptsPlatformCalls, motoboyId: courier.id, status: nextStatus },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function addAdminUserService(adminId, userId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const serviceTypeId = parsePositiveId(data.serviceTypeId, "Servico invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    assertProviderEligible(user);
    const type = await database.tipoServico.findFirst({
      where: { excluido_em: null, id: serviceTypeId, status: "ATIVO" },
    });
    if (!type) throw new AppError("Servico nao encontrado ou inativo", 404);
    if (!type.segmento_venda_id) throw new AppError("Este servico nao possui segmento comercial", 409);

    let seller = user.vendedor;
    if (!seller || seller.excluido_em) {
      if (!user.cpf) throw new AppError("Informe o CPF antes de criar um perfil de prestador", 428);
      seller = await database.vendedor.create({
        data: {
          cpf: user.cpf,
          nome_publico: user.nome,
          segmento_venda_id: type.segmento_venda_id,
          status: "ATIVO",
          status_kyc: "APROVADO",
          tipo_pessoa: "FISICA",
          usuario_id: user.id,
        },
        include: { motoboy: true },
      });
    }
    assertActiveSeller(seller);
    if (type.tipo_operacao === "ENTREGA_LOCAL" && seller.motoboy?.status !== "ATIVO") {
      throw new AppError("Cadastre e aprove o perfil de motoboy antes de liberar entrega local", 409);
    }

    await database.servicoVendedor.upsert({
      create: {
        categoria: type.nome,
        disponivel_agora: false,
        nome: type.nome,
        status: "ATIVO",
        tipo_servico_id: type.id,
        vendedor_id: seller.id,
      },
      update: { disponivel_agora: false, excluido_em: null, status: "ATIVO" },
      where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: seller.id } },
    });
    await adminUsersRepository.createAudit(database, {
      acao: "SERVICO_PRESTADOR_LIBERADO",
      administrador_id: adminId,
      dados_json: { tipoServicoId: type.id, vendedorId: seller.id },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function activateAllAdminUserServices(adminId, userId) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    assertProviderEligible(user);
    if (!user.cpf) throw new AppError("Informe o CPF antes de liberar servicos", 428);

    const serviceTypes = await database.tipoServico.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: { excluido_em: null, segmento_venda_id: { not: null }, status: "ATIVO" },
    });
    if (!serviceTypes.length) throw new AppError("Nenhum servico ativo foi encontrado", 409);

    let seller = user.vendedor;
    const courierActive = seller?.motoboy?.status === "ATIVO";
    const eligibleTypes = serviceTypes.filter(
      (type) => type.tipo_operacao !== "ENTREGA_LOCAL" || courierActive,
    );
    if (!eligibleTypes.length) {
      throw new AppError("Ative o cadastro de motoboy antes de liberar os servicos de entrega", 409);
    }
    if (!seller || seller.excluido_em) {
      seller = await database.vendedor.create({
        data: {
          cpf: user.cpf,
          nome_publico: user.nome,
          segmento_venda_id: eligibleTypes[0].segmento_venda_id,
          status: "ATIVO",
          status_kyc: "APROVADO",
          tipo_pessoa: "FISICA",
          usuario_id: user.id,
        },
        include: { motoboy: true },
      });
    } else {
      seller = await database.vendedor.update({
        data: { status: "ATIVO", status_kyc: "APROVADO" },
        include: { motoboy: true },
        where: { id: seller.id },
      });
    }

    for (const type of eligibleTypes) {
      await database.servicoVendedor.upsert({
        create: {
          categoria: type.nome,
          disponivel_agora: false,
          nome: type.nome,
          status: "ATIVO",
          tipo_servico_id: type.id,
          vendedor_id: seller.id,
        },
        update: { disponivel_agora: false, excluido_em: null, status: "ATIVO" },
        where: { vendedor_id_tipo_servico_id: { tipo_servico_id: type.id, vendedor_id: seller.id } },
      });
    }
    await adminUsersRepository.createAudit(database, {
      acao: "TODOS_SERVICOS_PRESTADOR_LIBERADOS",
      administrador_id: adminId,
      dados_json: {
        liberados: eligibleTypes.length,
        entregasIgnoradasSemMotoboy: serviceTypes.length - eligibleTypes.length,
        vendedorId: seller.id,
      },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}

export async function updateAdminUserService(adminId, userId, sellerServiceId, data) {
  const parsedUserId = parsePositiveId(userId, "Participante invalido");
  const parsedServiceId = parsePositiveId(sellerServiceId, "Servico do prestador invalido");
  await adminUsersRepository.transaction(async (database) => {
    const user = await findProviderParticipant(database, parsedUserId);
    const seller = user.vendedor;
    if (!seller || seller.excluido_em) throw new AppError("Perfil de prestador nao encontrado", 404);
    if (data.status === "ATIVO") assertProviderEligible(user);

    const service = await database.servicoVendedor.findFirst({
      include: { tipo_servico: true },
      where: { excluido_em: null, id: parsedServiceId, vendedor_id: seller.id },
    });
    if (!service) throw new AppError("Servico nao encontrado para este participante", 404);
    if (data.status === "ATIVO") {
      assertActiveSeller(seller);
      if (service.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL" && seller.motoboy?.status !== "ATIVO") {
        throw new AppError("Ative o perfil de motoboy antes de liberar este servico", 409);
      }
    }

    await database.servicoVendedor.update({
      data: { disponivel_agora: data.status === "ATIVO" ? service.disponivel_agora : false, status: data.status },
      where: { id: service.id },
    });
    await adminUsersRepository.createAudit(database, {
      acao: "SERVICO_PRESTADOR_ATUALIZADO",
      administrador_id: adminId,
      dados_json: { servicoVendedorId: service.id, status: data.status },
      usuario_alvo_id: user.id,
    });
  });
  return getAdminUser(parsedUserId);
}
