export function serviceFundsCopy(funds, isSeller) {
  if (!funds) return null;
  if (funds.state === "REFUNDED") return { title: "Pagamento devolvido", text: "Este pagamento foi estornado. Confira o histórico da carteira." };
  if (funds.state === "DISPUTED") return { title: "Valor em análise", text: "A contestação bloqueou a liberação. O suporte vai analisar o atendimento." };
  if (funds.state === "AWAITING_SERVICE" && funds.requiresDeliveryConfirmation) return {
    title: "Pagamento protegido",
    text: "Esta entrega está vinculada a uma loja. Após a confirmação de entrega, o valor entra na retenção de 24 horas. Acompanhe as etapas neste atendimento.",
  };
  if (funds.state === "AWAITING_SERVICE") return {
    title: "Pagamento protegido",
    text: isSeller ? "O valor está reservado. Ao marcar Serviço prestado, seu líquido entra como pendente na carteira de vendas por 24 horas."
      : "O pagamento está reservado. Depois que o profissional concluir, você terá 24 horas para informar um problema pelo chat.",
  };
  if (funds.state === "PENDING_RELEASE") return {
    title: isSeller ? "Valor pendente na carteira de vendas" : "Serviço concluído pelo profissional",
    text: isSeller ? "Liberação automática, sem depender da confirmação do cliente. Uma contestação pausa a liberação."
      : "Não precisa confirmar para liberar. Se houve algum problema, conteste neste chat antes do prazo abaixo.",
  };
  if (funds.state === "RELEASED") {
    if (!isSeller) return { title: "Pagamento liberado", text: "O prazo de proteção terminou e o pagamento foi liberado ao profissional." };
    if (funds.payoutStatus === "PAGO") return { title: "Pix enviado", text: "O banco confirmou o repasse para sua chave Pix de recebimento." };
    if (["PENDENTE", "PROCESSANDO", "EM_RECONCILIACAO"].includes(funds.payoutStatus)) return { title: "Repasse Pix em andamento", text: "O valor foi liberado. Acompanhe na carteira a confirmação do repasse pelo banco." };
    if (["FALHOU", "CANCELADO"].includes(funds.payoutStatus)) return { title: "Repasse Pix não concluído", text: "Confira o saldo e o status atualizado na carteira de vendas." };
    return { title: "Valor liberado", text: funds.destination === "PIX"
      ? "Consulte a carteira de vendas para acompanhar seu saldo e o repasse Pix."
      : "O líquido foi liberado na carteira de vendas. Consulte o saldo e os saques na carteira." };
  }
  return null;
}
