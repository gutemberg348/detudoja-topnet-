import { AppError } from "../../utils/errors.js";
import { settlePaidAutonomousChargeEarnings } from "../earnings/order-earnings.service.js";
import { createServiceChatsRepository } from "./service-chats.repository.js";

// Call only after payment and provider completion. The status claims and
// financial distribution belong to the same transaction, preventing duplicates.
export async function completePaidService(database, {
  actorUserId,
  chargeId,
  conversationId,
  expectedStatus,
  proposalId,
  when = new Date(),
  service = true,
}) {
  const repository = createServiceChatsRepository(database);
  const completed = await repository.updateConversations({
    data: { encerrado_em: when, status: "ENCERRADA" },
    where: { id: conversationId, status: expectedStatus },
  });
  if (completed.count !== 1) throw new AppError("O atendimento mudou antes da conclusao", 409);

  const proposal = await repository.updateProposals({
    data: { concluido_em: when, status: "CONCLUIDA" },
    where: { id: proposalId, conversa_servico_id: conversationId, status: "PAGA" },
  });
  if (proposal.count !== 1) throw new AppError("O pagamento mudou antes da conclusao", 409);

  await repository.updateCourierRequests({
    data: { status: "CONCLUIDA" },
    where: { conversa_servico_id: conversationId, status: "ACEITA" },
  });
  await repository.createMessage({
    data: {
      autor_usuario_id: actorUserId,
      conversa_servico_id: conversationId,
      lido_cliente_em: actorUserId ? null : when,
      lido_vendedor_em: actorUserId ? when : null,
      mensagem: service
        ? "Servico marcado como prestado. O valor liquido aparece como pendente na carteira de vendas e sera liberado automaticamente em 24 horas, sem depender da confirmacao do cliente. O cliente pode contestar nesse prazo."
        : "Corrida finalizada e pagamento confirmado. Os ganhos ficam protegidos por 24 horas; o cliente pode contestar nesse periodo.",
      origem: "SISTEMA",
    },
  });
  return settlePaidAutonomousChargeEarnings(database, chargeId);
}
