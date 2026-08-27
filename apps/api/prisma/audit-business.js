import { prisma } from "../src/config/prisma.js";

const activePaymentStatuses = ["PAGO", "LIQUIDADO"];
const activeTransactionStatuses = ["PAGA", "VALIDADA", "LIQUIDADA"];

function ids(rows) {
  return rows.slice(0, 10).map((row) => row.id);
}

function addFinding(findings, {
  count,
  description,
  examples = [],
  severity,
  title,
}) {
  findings.push({ count, description, examples, severity, title });
}

async function audit() {
  const findings = [];

  const [
    internalPixPayments,
    negativeWallets,
    approvedKycWithoutEvidence,
    completedOrdersWithoutSettlement,
    paidChargesWithoutSettlement,
    refundedPaymentsWithActiveSettlement,
    paidChargesWithInvalidPayment,
    controlledProductsWithInvalidStock,
    openServiceConversations,
    transactions,
  ] = await Promise.all([
    prisma.pagamento.findMany({
      select: { id: true },
      where: {
        gateway: "INTERNO",
        status: { in: activePaymentStatuses },
        valor_pago_pix_centavos: { gt: 0 },
      },
    }),
    prisma.carteira.findMany({
      select: { id: true },
      where: {
        OR: [
          { saldo_bloqueado_centavos: { lt: 0 } },
          { saldo_disponivel_centavos: { lt: 0 } },
          { saldo_pendente_centavos: { lt: 0 } },
        ],
      },
    }),
    prisma.kycUsuario.findMany({
      select: { id: true },
      where: {
        documento_frente_url: null,
        documento_verso_url: null,
        selfie_url: null,
        status: "APROVADO",
      },
    }),
    prisma.pedidoLoja.findMany({
      select: { id: true },
      where: {
        status: "CONCLUIDO",
        OR: [
          { pagamento: null },
          { pagamento: { transacao_comercial: null } },
        ],
      },
    }),
    prisma.cobranca.findMany({
      select: { id: true },
      where: {
        status: "PAGA",
        OR: [
          { pagamento: null },
          { pagamento: { transacao_comercial: null } },
        ],
      },
    }),
    prisma.pagamento.findMany({
      select: { id: true },
      where: {
        status: "ESTORNADO",
        transacao_comercial: { status: { in: activeTransactionStatuses } },
      },
    }),
    prisma.cobranca.findMany({
      select: { id: true },
      where: {
        status: "PAGA",
        pagamento: { status: { notIn: activePaymentStatuses } },
      },
    }),
    prisma.produtoLoja.findMany({
      select: { id: true },
      where: {
        estoque_controlado: true,
        OR: [
          { estoque_quantidade: null },
          { estoque_quantidade: { lt: 0 } },
        ],
      },
    }),
    prisma.conversaServico.findMany({
      select: {
        cliente_usuario_id: true,
        id: true,
        servico_vendedor_id: true,
      },
      where: {
        loja_solicitante_id: null,
        pedido_loja_id: null,
        status: { in: ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"] },
      },
    }),
    prisma.transacaoComercial.findMany({
      select: {
        id: true,
        taxa_plataforma_centavos: true,
        valor_bruto_centavos: true,
        valor_empresa_centavos: true,
        valor_liquido_lojista_centavos: true,
        valor_pool_recompensas_centavos: true,
      },
      where: { status: { in: activeTransactionStatuses } },
    }),
  ]);

  if (internalPixPayments.length > 0) {
    addFinding(findings, {
      count: internalPixPayments.length,
      description: "Pagamentos registram valor Pix como recebido pelo gateway INTERNO. Confirme se houve entrada real de dinheiro antes de liberar pedido ou ganhos.",
      examples: ids(internalPixPayments),
      severity: "CRITICAL",
      title: "Pix interno marcado como pago",
    });
  }

  if (refundedPaymentsWithActiveSettlement.length > 0) {
    addFinding(findings, {
      count: refundedPaymentsWithActiveSettlement.length,
      description: "O comprador foi estornado, mas a transacao comercial continua ativa. Recebiveis e bonus podem ter permanecido creditados.",
      examples: ids(refundedPaymentsWithActiveSettlement),
      severity: "CRITICAL",
      title: "Estorno sem reversao financeira completa",
    });
  }

  if (negativeWallets.length > 0) {
    addFinding(findings, {
      count: negativeWallets.length,
      description: "Carteiras com saldo negativo violam a invariante financeira basica.",
      examples: ids(negativeWallets),
      severity: "CRITICAL",
      title: "Saldo negativo",
    });
  }

  const inconsistentTransactions = transactions.filter((transaction) => {
    const gross = transaction.valor_bruto_centavos;
    const fee = transaction.taxa_plataforma_centavos;
    const merchantNet = transaction.valor_liquido_lojista_centavos;
    const company = transaction.valor_empresa_centavos;
    const rewards = transaction.valor_pool_recompensas_centavos;

    return gross !== merchantNet + fee || fee !== company + rewards;
  });

  if (inconsistentTransactions.length > 0) {
    addFinding(findings, {
      count: inconsistentTransactions.length,
      description: "Valor bruto, liquido, taxa, plataforma e recompensas nao fecham contabilmente.",
      examples: ids(inconsistentTransactions),
      severity: "CRITICAL",
      title: "Transacao comercial nao conserva valores",
    });
  }

  if (completedOrdersWithoutSettlement.length > 0) {
    addFinding(findings, {
      count: completedOrdersWithoutSettlement.length,
      description: "Pedidos concluidos deveriam possuir pagamento e transacao comercial liquidados.",
      examples: ids(completedOrdersWithoutSettlement),
      severity: "HIGH",
      title: "Pedido concluido sem liquidacao",
    });
  }

  if (paidChargesWithoutSettlement.length > 0) {
    addFinding(findings, {
      count: paidChargesWithoutSettlement.length,
      description: "Cobrancas pagas sem transacao comercial nao geram trilha completa de repasse e comissao.",
      examples: ids(paidChargesWithoutSettlement),
      severity: "HIGH",
      title: "Cobranca paga sem liquidacao",
    });
  }

  if (paidChargesWithInvalidPayment.length > 0) {
    addFinding(findings, {
      count: paidChargesWithInvalidPayment.length,
      description: "A cobranca esta paga, mas o pagamento associado nao esta em estado financeiro confirmado.",
      examples: ids(paidChargesWithInvalidPayment),
      severity: "HIGH",
      title: "Status divergente entre cobranca e pagamento",
    });
  }

  if (approvedKycWithoutEvidence.length > 0) {
    addFinding(findings, {
      count: approvedKycWithoutEvidence.length,
      description: "Contas aprovadas nao possuem frente, verso nem selfie. Nao use esse status para liberar saque ou limites reais.",
      examples: ids(approvedKycWithoutEvidence),
      severity: "HIGH",
      title: "KYC aprovado sem evidencia",
    });
  }

  if (controlledProductsWithInvalidStock.length > 0) {
    addFinding(findings, {
      count: controlledProductsWithInvalidStock.length,
      description: "Produto com controle de estoque precisa de quantidade valida.",
      examples: ids(controlledProductsWithInvalidStock),
      severity: "MEDIUM",
      title: "Estoque controlado inconsistente",
    });
  }

  const conversationGroups = new Map();
  for (const conversation of openServiceConversations) {
    const key = `${conversation.cliente_usuario_id}:${conversation.servico_vendedor_id}`;
    const group = conversationGroups.get(key) ?? [];
    group.push(conversation.id);
    conversationGroups.set(key, group);
  }
  const duplicateConversations = [...conversationGroups.values()].filter((group) => group.length > 1);

  if (duplicateConversations.length > 0) {
    addFinding(findings, {
      count: duplicateConversations.length,
      description: "O mesmo cliente possui mais de uma conversa ativa com o mesmo servico. Isso fragmenta propostas, notificacoes e historico.",
      examples: duplicateConversations.slice(0, 10).flat(),
      severity: "MEDIUM",
      title: "Conversas de servico ativas duplicadas",
    });
  }

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((left, right) => order[left.severity] - order[right.severity]);

  console.log("DeTudoJa business audit (read-only)");
  console.log(`Checked ${transactions.length} active commercial transactions.`);

  if (findings.length === 0) {
    console.log("PASS: no persisted-data invariant violations were found.");
    return;
  }

  for (const finding of findings) {
    console.log(`\n[${finding.severity}] ${finding.title}: ${finding.count}`);
    console.log(finding.description);
    if (finding.examples.length > 0) {
      console.log(`Example IDs: ${finding.examples.join(", ")}`);
    }
  }

  process.exitCode = 1;
}

try {
  await audit();
} finally {
  await prisma.$disconnect();
}
