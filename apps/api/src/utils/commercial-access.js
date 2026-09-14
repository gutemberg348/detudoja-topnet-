import { AppError } from "./errors.js";

export const commercialTier2UserWhere = {
  excluido_em: null,
  kyc: { is: { status: "APROVADO" } },
  nivel_kyc: "TIER_2",
  status: "ATIVO",
};

export async function requireCommercialTier2(database, userId) {
  const user = await database.usuario.findFirst({
    select: { id: true },
    where: { id: userId, ...commercialTier2UserWhere },
  });

  if (!user) {
    throw new AppError(
      "Conclua a verificacao TIER_2 antes de realizar vendas ou prestar servicos",
      428,
    );
  }

  return user;
}
