export function serviceRegistrationFeedback(service, submitted) {
  const name = service?.name || submitted.name;
  const available = service?.available ?? submitted.available;
  return ["Serviço cadastrado", available
    ? `${name} foi adicionado aos seus serviços, com disponibilidade ativada.`
    : `${name} foi adicionado. Ative a disponibilidade quando quiser atender.`];
}

export function withdrawalFeedback(status) {
  if (status === "PAGO") return ["Pix enviado", "O banco confirmou o envio do seu saque.", "success"];
  if (["FALHOU", "CANCELADO", "RECUSADO"].includes(status)) {
    return ["Saque não enviado", "Confira o status e o saldo atualizado antes de tentar novamente.", "error"];
  }
  if (status === "EM_RECONCILIACAO") {
    return ["Conferindo o saque", "Estamos verificando a resposta do banco. Acompanhe o status antes de tentar novamente.", "info"];
  }
  return ["Saque solicitado", "Seu pedido foi registrado. Acompanhe a análise e o envio no histórico.", "info"];
}

export const serviceActionFeedback = {
  location: ["Endereço enviado", "O endereço foi compartilhado nesta conversa."],
  proposal: ["Proposta enviada", "Agora aguarde a resposta do cliente."],
  accept: ["Proposta aceita", "Confira a forma de pagamento e os próximos passos na conversa."],
  decline: ["Proposta recusada", "Você pode combinar outros detalhes pelo chat."],
  delivered: ["Conclusão registrada", "Confira no atendimento o status do pagamento e o prazo de liberação do seu valor."],
  "accept-call": ["Atendimento aceito", "O chat está liberado para combinar os detalhes."],
  "close-pending-call": ["Chamada encerrada", "Esse atendimento foi cancelado."],
  completion: ["Conclusão confirmada", "Sua confirmação foi registrada no atendimento."],
  dispute: ["Contestação registrada", "Seu pedido de revisão foi enviado. Acompanhe pela conversa."],
  "delivery-code": ["Entrega confirmada", "O código foi validado e a entrega do pedido foi registrada."],
  review: ["Avaliação enviada", "Obrigado por contar como foi o atendimento."],
  "cancel-ride": ["Atendimento cancelado", "O cancelamento foi registrado. Confira os detalhes na conversa."],
};
