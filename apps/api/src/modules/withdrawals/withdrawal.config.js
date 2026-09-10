import { systemSettingsRepository } from "../settings/system-settings.repository.js";

export const withdrawalSettingsKey = "finance.withdrawals";

export const defaultWithdrawalSettings = Object.freeze({
  dailyLimitCents: 500000,
  enabled: true,
  fixedFeeCents: 0,
  manualApproval: true,
  maximumCents: 500000,
  minimumCents: 1000,
});

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeWithdrawalSettings(value = {}) {
  const minimumCents = integer(value.minimumCents, defaultWithdrawalSettings.minimumCents);
  const maximumCents = Math.max(
    minimumCents,
    integer(value.maximumCents, defaultWithdrawalSettings.maximumCents),
  );

  return {
    dailyLimitCents: Math.max(
      maximumCents,
      integer(value.dailyLimitCents, defaultWithdrawalSettings.dailyLimitCents),
    ),
    enabled: value.enabled !== false,
    fixedFeeCents: integer(value.fixedFeeCents, defaultWithdrawalSettings.fixedFeeCents),
    manualApproval: value.manualApproval !== false,
    maximumCents,
    minimumCents,
  };
}

export async function getWithdrawalSettings() {
  const setting = await systemSettingsRepository.findByKey(withdrawalSettingsKey);
  return normalizeWithdrawalSettings(setting?.valor_json ?? {});
}

export async function updateWithdrawalSettings(adminId, value) {
  const settings = normalizeWithdrawalSettings(value);

  await systemSettingsRepository.upsert({
    adminId,
    description: "Taxa, limites e aprovacao dos saques Pix solicitados no aplicativo.",
    key: withdrawalSettingsKey,
    value: settings,
  });

  return settings;
}
