import { AppError } from "./errors.js";

export async function requireUserCpf(database, userId) {
  const user = await database.usuario.findUnique({
    select: { cpf: true, id: true },
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  if (!user.cpf) {
    throw new AppError("Informe seu CPF para concluir esta operacao", 428);
  }

  return user;
}
