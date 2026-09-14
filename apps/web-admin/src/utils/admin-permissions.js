const permissionsByPage = {
  administrators: ["super_admin"],
  categories: ["super_admin", "admin", "operacoes"],
  dashboard: ["super_admin", "admin", "operacoes", "suporte", "financeiro", "compliance", "kyc"],
  kyc: ["super_admin", "admin", "compliance", "kyc"],
  network: ["super_admin", "admin", "operacoes"],
  participants: ["super_admin", "admin", "operacoes", "financeiro", "compliance", "kyc"],
  payments: ["super_admin", "admin", "financeiro"],
  wallets: ["super_admin", "admin", "financeiro"],
  withdrawals: ["super_admin", "admin", "financeiro"],
  segments: ["super_admin", "admin", "operacoes"],
  serviceTypes: ["super_admin", "admin", "operacoes"],
  settings: ["super_admin", "admin", "financeiro", "suporte"],
  stores: ["super_admin", "admin", "operacoes"],
};

export function canAccessAdminPage(role, page) {
  return (permissionsByPage[page] ?? []).includes(String(role ?? "").toLowerCase());
}

export function canManageWallet(role) {
  return ["super_admin", "financeiro"].includes(String(role ?? "").toLowerCase());
}

export function canManageNetwork(role) {
  return String(role ?? "").toLowerCase() === "super_admin";
}

export function canRefundPayments(role) {
  return canManageWallet(role);
}

export function canManageWithdrawals(role) {
  return ["super_admin", "financeiro"].includes(String(role ?? "").toLowerCase());
}

export function canManageEarnings(role) {
  return ["super_admin", "admin", "financeiro"].includes(String(role ?? "").toLowerCase());
}

export function canManageSupport(role) {
  return ["super_admin", "admin", "suporte"].includes(String(role ?? "").toLowerCase());
}

export function canManageParticipantData(role) {
  return ["super_admin", "admin", "operacoes"].includes(String(role ?? "").toLowerCase());
}

export function canManageProviderProfiles(role) {
  return ["super_admin", "admin", "operacoes"].includes(String(role ?? "").toLowerCase());
}

export function canManageParticipantStatus(role) {
  return ["super_admin", "admin", "compliance", "kyc"].includes(String(role ?? "").toLowerCase());
}

export function canManageKyc(role) {
  return ["super_admin", "admin", "compliance", "kyc"].includes(String(role ?? "").toLowerCase());
}

export function canManagePayoutAccount(role) {
  return ["super_admin", "admin", "financeiro"].includes(String(role ?? "").toLowerCase());
}
