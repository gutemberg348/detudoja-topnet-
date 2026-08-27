import { AppError } from "../../utils/errors.js";
import { getCurrentUser } from "../users/users.service.js";
import { kycRepository } from "./kyc.repository.js";

export async function verifyCurrentUserDocument(userId) {
  const user = await kycRepository.findUser(userId);

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (!user.cpf) {
    throw new AppError("Informe o CPF antes de verificar o documento", 428);
  }

  await kycRepository.transaction(async (repository) => {
    await repository.approveUserKyc(user);
    await repository.promoteUserKyc(userId);
    await repository.activateIndication(userId);
    await repository.approveMerchant(userId);
    await repository.approveSeller(userId);
  });

  return getCurrentUser(userId);
}
