import { prisma } from "../../config/prisma.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";

const storeSelect = {
  banner_url: true,
  id: true,
  logo_url: true,
  nome: true,
  slug: true,
};
const chatProductSelect = {
  aceita_entrega: true,
  aceita_retirada: true,
  descricao: true,
  destaque: true,
  detalhes_json: true,
  estoque_controlado: true,
  estoque_quantidade: true,
  id: true,
  imagem_url: true,
  marca: true,
  nome: true,
  prazo_estimado_minutos: true,
  preco_centavos: true,
  preco_promocional_centavos: true,
  resumo_curto: true,
  sku: true,
  unidade_medida: true,
};
const customerSelect = { foto_url: true, id: true, nome: true };
const conversationListInclude = {
  cliente: { select: customerSelect },
  loja: { select: storeSelect },
  mensagens: {
    include: { autor: { select: customerSelect } },
    orderBy: { criado_em: "desc" },
    take: 1,
  },
};
const catalogStoreSelect = {
  ...storeSelect,
  _count: {
    select: { produtos: { where: { excluido_em: null, status: "ATIVO" } } },
  },
  aberta_para_pedidos: true,
  categoria: { select: { icone_url: true, id: true, nome: true } },
  produtos: {
    orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    select: chatProductSelect,
    take: 100,
    where: { excluido_em: null, status: "ATIVO" },
  },
  segmento_venda: {
    select: { id: true, negocia_pedido_por_chat: true, nome: true, slug: true },
  },
};
const conversationDetailInclude = {
  cliente: { select: customerSelect },
  loja: { select: catalogStoreSelect },
  mensagens: {
    include: { autor: { select: customerSelect } },
    orderBy: { criado_em: "asc" },
  },
};

function storeAccessWhere(userId) {
  return {
    OR: [
      { lojista: { usuario_id: userId } },
      { usuarios: { some: { status: "ATIVO", usuario_id: userId } } },
    ],
  };
}

export const storeChatsRepository = {
  createConversation(userId, storeId) {
    return prisma.$transaction(async (transaction) => {
      const now = new Date();
      const conversation = await transaction.conversaLoja.create({
        data: {
          cliente_usuario_id: userId,
          loja_id: storeId,
          ultima_mensagem_em: now,
        },
      });
      await transaction.conversaLojaMensagem.create({
        data: {
          conversa_loja_id: conversation.id,
          lido_cliente_em: now,
          lido_loja_em: now,
          mensagem: "Cliente entrou na loja e iniciou a navegacao.",
          origem: "SISTEMA",
          tipo: "TEXTO",
        },
      });
      return conversation;
    });
  },

  async createSystemActivity(conversationId, { content = null, message, notifyStore = false }) {
    const now = new Date();
    return prisma.$transaction(async (transaction) => {
      const created = await transaction.conversaLojaMensagem.create({
        data: {
          conversa_loja_id: conversationId,
          conteudo_json: content,
          lido_cliente_em: now,
          lido_loja_em: notifyStore ? null : now,
          mensagem: message,
          origem: "SISTEMA",
          tipo: content?.kind === "PRODUCT" ? "PRODUTO" : "TEXTO",
        },
      });
      await transaction.conversaLoja.update({
        data: {
          ...(notifyStore ? { nao_lidas_loja: { increment: 1 } } : {}),
          ultima_mensagem_em: now,
        },
        where: { id: conversationId },
      });
      return created;
    });
  },

  async createMessage({ access, commercialMessage, scope, userId }) {
    const now = new Date();
    return prisma.$transaction(async (transaction) => {
      const created = await transaction.conversaLojaMensagem.create({
        data: {
          autor_usuario_id: userId,
          conversa_loja_id: access.conversation.id,
          lido_cliente_em: scope === "customer" ? now : null,
          lido_loja_em: scope === "seller" ? now : null,
          conteudo_json: commercialMessage.content,
          mensagem: commercialMessage.message,
          origem: scope === "customer" ? "CLIENTE" : "LOJA",
          tipo: commercialMessage.type,
        },
      });
      await transaction.conversaLoja.update({
        data: {
          ...(scope === "seller"
            ? { nao_lidas_cliente: { increment: 1 } }
            : commercialMessage.isSupport
              ? {
                  atendimento_solicitado_em: now,
                  nao_lidas_loja: { increment: 1 },
                }
              : {}),
          ultima_mensagem_em: now,
        },
        where: { id: access.conversation.id },
      });
      return created;
    });
  },

  findAccessConversation(id) {
    return prisma.conversaLoja.findUnique({
      include: {
        cliente: { select: customerSelect },
        loja: {
          include: {
            lojista: { select: { usuario_id: true } },
            usuarios: { select: { status: true, usuario_id: true } },
          },
        },
      },
      where: { id },
    });
  },

  findCatalogStore(storeId) {
    return prisma.loja.findUnique({
      select: catalogStoreSelect,
      where: { id: storeId },
    });
  },

  findConversationByPair(userId, storeId) {
    return prisma.conversaLoja.findUnique({
      where: {
        loja_id_cliente_usuario_id: {
          cliente_usuario_id: userId,
          loja_id: storeId,
        },
      },
    });
  },

  findPublicStore(storeId) {
    return prisma.loja.findFirst({
      select: {
        id: true,
        lojista: { select: { usuario_id: true } },
        usuarios: {
          select: { usuario_id: true },
          where: { status: "ATIVO" },
        },
      },
      where: {
        excluido_em: null,
        id: storeId,
        lojista: {
          is: {
            status: "ATIVO",
            status_kyc: "APROVADO",
            usuario: { is: commercialTier2UserWhere },
          },
        },
        status: "ATIVA",
        visivel_no_app: true,
      },
    });
  },

  isClientAvailable() {
    return Boolean(prisma.conversaLoja && prisma.conversaLojaMensagem);
  },

  list(userId, { isSeller, storeId }) {
    return prisma.conversaLoja.findMany({
      include: conversationListInclude,
      orderBy: [{ ultima_mensagem_em: "desc" }, { atualizado_em: "desc" }],
      where: isSeller
        ? {
            ...(storeId ? { loja_id: storeId } : {}),
            loja: { excluido_em: null, ...storeAccessWhere(userId) },
          }
        : {
            cliente_usuario_id: userId,
            loja: { excluido_em: null },
          },
    });
  },

  loadConversation(conversationId) {
    return prisma.conversaLoja.findUnique({
      include: conversationDetailInclude,
      where: { id: conversationId },
    });
  },

  markRead(conversationId, scope, now = new Date()) {
    return prisma.$transaction(async (transaction) => {
      const readMessages = await transaction.conversaLojaMensagem.updateMany({
        data: scope === "customer" ? { lido_cliente_em: now } : { lido_loja_em: now },
        where: {
          conversa_loja_id: conversationId,
          ...(scope === "customer"
            ? { lido_cliente_em: null, origem: { in: ["LOJA", "SISTEMA", "ADMIN"] } }
            : { lido_loja_em: null, origem: { in: ["CLIENTE", "SISTEMA"] } }),
        },
      });
      if (readMessages.count > 0) {
        await transaction.conversaLoja.update({
          data: scope === "customer"
            ? { nao_lidas_cliente: { decrement: readMessages.count } }
            : { nao_lidas_loja: 0 },
          where: { id: conversationId },
        });
      }
      return readMessages.count;
    });
  },
};
