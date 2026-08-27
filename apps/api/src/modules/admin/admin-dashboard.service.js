import { serializeAdminUser } from "./admin.serializer.js";
import { adminDashboardRepository } from "./admin-dashboard.repository.js";

export async function getAdminDashboard() {
  const {
    activeCategories,
    activeParticipants,
    approvedKyc,
    blockedParticipants,
    pendingKyc,
    pendingParticipants,
    recentParticipants,
    totalCategories,
    totalParticipants,
  } = await adminDashboardRepository.getSnapshot();

  return {
    categories: {
      active: activeCategories,
      total: totalCategories,
    },
    kyc: {
      approved: approvedKyc,
      pending: pendingKyc,
    },
    participants: {
      active: activeParticipants,
      blocked: blockedParticipants,
      pending: pendingParticipants,
      total: totalParticipants,
    },
    recentParticipants: recentParticipants.map(serializeAdminUser),
  };
}
