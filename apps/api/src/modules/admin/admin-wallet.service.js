import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { adminWalletRepository } from "./admin-wallet.repository.js";

function cents(value) {
  return Number(value ?? 0);
}

function serializeType(type, aggregate) {
  const availableCents = cents(aggregate?._sum.saldo_disponivel_centavos);
  const blockedCents = cents(aggregate?._sum.saldo_bloqueado_centavos);
  const pendingCents = cents(aggregate?._sum.saldo_pendente_centavos);

  return {
    availableCents,
    blockedCents,
    canUseForPurchase: type.permite_uso_em_compra,
    canWithdraw: type.permite_saque,
    code: type.codigo,
    description: type.descricao,
    id: type.id,
    name: type.nome,
    pendingCents,
    status: type.status,
    totalCents: availableCents + blockedCents + pendingCents,
    walletsCount: aggregate?._count._all ?? 0,
  };
}

export async function getAdminWalletOverview() {
  const [types, aggregates] = await Promise.all([
    adminWalletRepository.listTypes(),
    adminWalletRepository.aggregateWallets(),
  ]);
  const aggregateByType = new Map(aggregates.map((item) => [item.tipo_carteira_id, item]));
  const wallets = types.map((type) => serializeType(type, aggregateByType.get(type.id)));

  return {
    summary: {
      availableCents: wallets.reduce((total, wallet) => total + wallet.availableCents, 0),
      blockedCents: wallets.reduce((total, wallet) => total + wallet.blockedCents, 0),
      pendingCents: wallets.reduce((total, wallet) => total + wallet.pendingCents, 0),
      withdrawableTypes: wallets.filter((wallet) => wallet.canWithdraw).length,
    },
    wallets,
  };
}

export async function updateAdminWalletType(typeId, data) {
  const id = parsePositiveId(typeId, "Tipo de carteira invalido");
  const type = await adminWalletRepository.findType(id);

  if (!type) {
    throw new AppError("Tipo de carteira nao encontrado", 404);
  }

  await adminWalletRepository.updateType(id, { permite_saque: data.canWithdraw });
  return getAdminWalletOverview();
}
