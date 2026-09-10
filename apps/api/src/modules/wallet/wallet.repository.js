import { prisma } from "../../config/prisma.js";

const paymentInclude = {
  cobranca: {
    select: {
      codigo_publico: true,
      origem: true,
      titulo: true,
    },
  },
  loja: { select: { id: true, nome: true } },
  pedido_loja: { select: { codigo: true } },
  vendedor: { select: { id: true, nome_publico: true } },
};

export function createWalletRepository(database = prisma) {
  return {
    createMissingWallets(userId, walletTypes) {
      return database.carteira.createMany({
        data: walletTypes.map((walletType) => ({
          saldo_bloqueado_centavos: 0,
          saldo_disponivel_centavos: 0,
          saldo_pendente_centavos: 0,
          tipo_carteira_id: walletType.id,
          usuario_id: userId,
        })),
        skipDuplicates: true,
      });
    },

    createMovement(data) {
      return database.lancamentoCarteira.create({ data });
    },

    decrementAvailableBalance(walletId, amount) {
      return database.carteira.updateMany({
        data: { saldo_disponivel_centavos: { decrement: BigInt(amount) } },
        where: {
          id: walletId,
          saldo_disponivel_centavos: { gte: BigInt(amount) },
          status: "ATIVA",
        },
      });
    },

    findActivePurchaseWallet(userId, walletId) {
      return database.carteira.findFirst({
        include: { tipo_carteira: true },
        where: {
          id: Number(walletId),
          status: "ATIVA",
          tipo_carteira: { permite_uso_em_compra: true },
          usuario_id: userId,
        },
      });
    },

    findActiveWalletByCode(userId, walletCode) {
      return database.carteira.findFirst({
        select: { id: true },
        where: {
          status: "ATIVA",
          tipo_carteira: { codigo: walletCode },
          usuario_id: userId,
        },
      });
    },

    findActiveWalletWithTypeByCode(userId, walletCode) {
      return database.carteira.findFirst({
        include: { tipo_carteira: true },
        where: {
          status: "ATIVA",
          tipo_carteira: { codigo: walletCode, status: "ATIVO" },
          usuario_id: userId,
        },
      });
    },

    findMovements(userId) {
      return database.lancamentoCarteira.findMany({
        include: { carteira: { include: { tipo_carteira: true } } },
        orderBy: { criado_em: "desc" },
        take: 30,
        where: { usuario_id: userId },
      });
    },

    findPayments(userId, paymentIds) {
      return database.pagamento.findMany({
        include: paymentInclude,
        where: {
          id: { in: paymentIds },
          usuario_pagador_id: userId,
        },
      });
    },

    findPurchaseWallets(userId) {
      return database.carteira.findMany({
        include: { tipo_carteira: true },
        where: {
          status: "ATIVA",
          tipo_carteira: { permite_uso_em_compra: true },
          usuario_id: userId,
        },
      });
    },

    findWalletByCode(userId, code) {
      return database.carteira.findFirst({
        include: {
          lancamentos: { orderBy: { criado_em: "desc" }, take: 50 },
          tipo_carteira: true,
        },
        where: { tipo_carteira: { codigo: code }, usuario_id: userId },
      });
    },

    findWallets(userId) {
      return database.carteira.findMany({
        include: { tipo_carteira: true },
        orderBy: { tipo_carteira: { nome: "asc" } },
        where: { usuario_id: userId },
      });
    },

    incrementAvailableBalance(walletId, amount) {
      return database.carteira.update({
        data: { saldo_disponivel_centavos: { increment: BigInt(amount) } },
        select: { saldo_disponivel_centavos: true },
        where: { id: walletId },
      });
    },

    incrementPendingBalance(walletId, amount) {
      return database.carteira.update({
        data: { saldo_pendente_centavos: { increment: BigInt(amount) } },
        select: {
          saldo_disponivel_centavos: true,
          saldo_pendente_centavos: true,
        },
        where: { id: walletId },
      });
    },

    upsertWalletType(definition) {
      return database.tipoCarteira.upsert({
        create: {
          codigo: definition.code,
          descricao: definition.description,
          nome: definition.name,
          permite_saque: definition.permiteSaque,
          permite_uso_em_compra: definition.permiteUsoEmCompra,
        },
        update: {
          descricao: definition.description,
          nome: definition.name,
          permite_uso_em_compra: definition.permiteUsoEmCompra,
          status: "ATIVO",
        },
        where: { codigo: definition.code },
      });
    },
  };
}

export const walletRepository = createWalletRepository();
