import { prisma } from "../../config/prisma.js";

export const systemSettingsRepository = {
  findByKey(key) {
    return prisma.configuracaoSistema.findUnique({ where: { chave: key } });
  },

  upsert({ adminId, description, key, value }) {
    return prisma.configuracaoSistema.upsert({
      create: {
        atualizado_por_admin_id: adminId,
        chave: key,
        descricao: description,
        valor_json: value,
      },
      update: {
        atualizado_por_admin_id: adminId,
        valor_json: value,
      },
      where: { chave: key },
    });
  },
};
