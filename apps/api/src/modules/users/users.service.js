import { AppError } from "../../utils/errors.js";
import { addressData } from "../../utils/location.js";
import { usersRepository } from "./users.repository.js";

function serializeAddress(address) {
  const complete = [address.cep, address.bairro, address.rua, address.numero]
    .every((value) => String(value ?? "").trim());

  return {
    bairro: address.bairro,
    cep: address.cep,
    cidade: address.cidade,
    complete,
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
    marketplaceLocation: user.cidade_busca && user.estado_busca
      ? { city: user.cidade_busca, state: user.estado_busca }
      : null,
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
  const directVerifiedCount = await usersRepository.countVerifiedDirects(user.id);
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
  const user = await usersRepository.findUser(userId);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  return { user: serializeUser(user, await getAccountLevel(user)) };
}

export async function listCurrentUserAddresses(userId) {
  const [addresses, location] = await Promise.all([
    usersRepository.findAddresses(userId),
    usersRepository.findMarketplaceLocation(userId),
  ]);

  return {
    addresses: addresses.map(serializeAddress),
    marketplaceLocation: location?.cidade_busca && location?.estado_busca
      ? { city: location.cidade_busca, state: location.estado_busca }
      : null,
  };
}

export async function updateCurrentUser(userId, data) {
  try {
    await usersRepository.transaction(async (repository) => {
      const currentAddress = data.address
        ? await repository.findCurrentAddress(userId)
        : null;

      const userData = {
        ...(data.email ? { email: data.email } : {}),
        ...(data.name ? { nome: data.name } : {}),
        ...(data.phone ? { telefone: data.phone } : {}),
        ...(data.location
          ? { cidade_busca: data.location.city, estado_busca: data.location.state }
          : {}),
      };

      if (Object.keys(userData).length) {
        await repository.updateUser(userId, userData);
      }

      if (data.address) {
        const savedAddress = addressData(data.address);
        if (currentAddress) {
          await repository.updateAddress(currentAddress.id, savedAddress);
        } else {
          await repository.createMainAddress(userId, savedAddress);
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
