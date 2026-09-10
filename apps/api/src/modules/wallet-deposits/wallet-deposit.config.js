export const walletDepositProcessingFeeCents = 99;

export function calculateWalletDepositAmounts(grossAmountCents) {
  const grossCents = Number(grossAmountCents);
  const feeCents = walletDepositProcessingFeeCents;

  if (!Number.isSafeInteger(grossCents) || grossCents <= feeCents) {
    return { feeCents, grossCents, netCents: 0 };
  }

  return {
    feeCents,
    grossCents,
    netCents: grossCents - feeCents,
  };
}
