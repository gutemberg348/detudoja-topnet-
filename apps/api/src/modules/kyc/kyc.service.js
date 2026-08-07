import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { getCurrentUser } from "../users/users.service.js";

export async function verifyCurrentUserDocument(userId) {
  const user = await prisma.usuario.findUnique({
    include: { kyc: true },
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (!user.cpf) {
    throw new AppError("Informe o CPF antes de verificar o documento", 428);
  }

  await prisma.$transaction(async (database) => {
    await database.kycUsuario.upsert({
      create: {
        cpf: user.cpf,
        nome_completo: user.nome,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: userId,
        validado_em: new Date(),
      },
      update: {
        cpf: user.cpf,
        nome_completo: user.nome,
        motivo_reprovacao: null,
        status: "APROVADO",
        validado_em: new Date(),
      },
      where: { usuario_id: userId },
    });

    await database.usuario.update({
      data: { nivel_kyc: "TIER_2" },
      where: { id: userId },
    });

    await database.indicacao.updateMany({
      data: { status: "ATIVA" },
      where: { indicado_usuario_id: userId },
    });

    await database.lojista.updateMany({
      data: { status_kyc: "APROVADO" },
      where: { usuario_id: userId },
    });

    await database.vendedor.updateMany({
      data: { status_kyc: "APROVADO" },
      where: { usuario_id: userId },
    });
  });

  return getCurrentUser(userId);
}
