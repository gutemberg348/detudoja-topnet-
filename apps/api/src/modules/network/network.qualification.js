export const qualifyingIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];

export const networkQualificationInclude = {
  indicacoes_feitas: {
    include: { indicado: { include: { kyc: true } } },
    where: { status: { in: qualifyingIndicationStatuses } },
  },
  kyc: true,
};

export function countActiveVerifiedDirects(user) {
  return (user.indicacoes_feitas ?? []).filter(
    (indication) =>
      indication.indicado.status === "ATIVO" &&
      indication.indicado.kyc?.status === "APROVADO",
  ).length;
}

export function isQualifiedForNetwork(user) {
  return (
    user?.status === "ATIVO" &&
    !user.ganhos_rede_bloqueados &&
    user.kyc?.status === "APROVADO" &&
    countActiveVerifiedDirects(user) >= 2
  );
}
