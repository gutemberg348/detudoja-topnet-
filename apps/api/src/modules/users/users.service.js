import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { addressData } from "../../utils/location.js";

const userInclude = {
  enderecos: {
    orderBy: [{ principal: "desc" }, { criado_em: "desc" }],
    where: { excluido_em: null },
  },
  kyc: true,
  lojista: true,
  vendedor: true,
};

function serializeAddress(address) {
  return {
    bairro: address.bairro,
    cep: address.cep,
    cidade: address.cidade,
    complemento: address.complemento,
    estado: address.estado,
    id: address.id,
    nome: address.nome_endereco,
    numero: address.numero,
    principal: address.principal,
    rua: address.rua,
  };
}

function maskCpf(cpf) {
  if (!cpf) {
    return null;
  }

  return `***.***.***-${cpf.slice(-2)}`;
}

function serializeUser(user, accountLevel) {
  return {
    accountType: user.tipo_conta,
    accountLevel: accountLevel.code,
    accountLevelLabel: accountLevel.label,
    addresses: user.enderecos.map(serializeAddress),
    createdAt: user.criado_em.toISOString(),
    cpf: maskCpf(user.cpf),
    directVerifiedCount: accountLevel.directVerifiedCount,
    directVerifiedRequired: accountLevel.directVerifiedRequired,
    email: user.email,
    emailVerified: user.email_verificado,
    id: user.id,
    isNetworkQualified: accountLevel.isNetworkQualified,
    kycLevel: user.nivel_kyc,
    kycStatus: user.kyc?.status ?? "PENDENTE",
    lastLoginAt: user.ultimo_login_em?.toISOString() ?? null,
    name: user.nome,
    phone: user.telefone,
    phoneVerified: user.telefone_verificado,
    profiles: deriveProfiles(user),
    status: user.status,
  };
}

function deriveProfiles(user) {
  return [
    {
      role: "CONSUMIDOR",
      status: user.status,
    },
    ...(user.lojista && !user.lojista.excluido_em
      ? [{ role: "LOJISTA", status: user.lojista.status }]
      : []),
    ...(user.vendedor && !user.vendedor.excluido_em
      ? [{ role: "VENDEDOR", status: user.vendedor.status }]
      : []),
  ];
}

async function getAccountLevel(user) {
  const directVerifiedCount = await prisma.indicacao.count({
    where: {
      indicador_usuario_id: user.id,
      indicado: {
        status: "ATIVO",
        kyc: { is: { status: "APROVADO" } },
      },
    },
  });
  const isKycApproved = user.kyc?.status === "APROVADO";
  const isNetworkQualified = isKycApproved && directVerifiedCount >= 2;

  return {
    code: isNetworkQualified ? "OURO" : isKycApproved ? "PRATA" : "INICIANTE",
    directVerifiedCount,
    directVerifiedRequired: 2,
    isNetworkQualified,
    code: isNetworkQualified ? "Ouro" : isKycApproved ? "Prata" : "Iniciante",
  };
}

export async function getCurrentUser(userId) {
  const user = await prisma.usuario.findUnique({
    include: userInclude,
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  return { user: serializeUser(user, await getAccountLevel(user)) };
}

export async function listCurrentUserAddresses(userId) {
  const addresses = await prisma.enderecoUsuario.findMany({
    orderBy: [{ principal: "desc" }, { criado_em: "desc" }],
    where: { excluido_em: null, usuario_id: userId },
  });

  return { addresses: addresses.map(serializeAddress) };
}

export async function updateCurrentUser(userId, data) {
  try {
    await prisma.$transaction(async (database) => {
      const currentAddress = data.address
        ? await database.enderecoUsuario.findFirst({
            orderBy: [{ principal: "desc" }, { criado_em: "asc" }],
            where: { excluido_em: null, usuario_id: userId },
          })
        : null;

      await database.usuario.update({
        data: {
          ...(data.email ? { email: data.email } : {}),
          ...(data.name ? { nome: data.name } : {}),
          ...(data.phone ? { telefone: data.phone } : {}),
        },
        where: { id: userId },
      });

      if (data.address) {
        const savedAddress = addressData(data.address);
        if (currentAddress) {
          await database.enderecoUsuario.update({
            data: { ...savedAddress, principal: true },
            where: { id: currentAddress.id },
          });
        } else {
          await database.enderecoUsuario.create({
            data: { ...savedAddress, nome_endereco: "Endereco principal", principal: true, usuario_id: userId },
          });
        }
      }
    });
  } catch (error) {
    if (error?.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      throw new AppError(
        target.includes("telefone")
          ? "Este telefone ja esta cadastrado"
          : "Este e-mail ja esta cadastrado",
        409,
      );
    }

    throw error;
  }

  return getCurrentUser(userId);
}
