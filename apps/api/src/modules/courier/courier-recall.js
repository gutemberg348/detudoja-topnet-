import { AppError } from "../../utils/errors.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";
import { courierRepository } from "./courier.repository.js";
import { isCourierSellerBusy } from "./courier-availability.js";

export async function previousCourierAvailability(userId, conversationId, serviceTypeId = null, repository = courierRepository) {
  const previous = await repository.findServiceConversation({
    include: { vendedor: { include: { motoboy: true } }, servico_vendedor: true },
    where: {
      id: Number(conversationId), cliente_usuario_id: userId,
      loja_solicitante_id: null, pedido_loja_id: null,
      status: { in: ["ENCERRADA", "CANCELADA"] },
      servico_vendedor: { is: { tipo_servico: { is: { tipo_operacao: "ENTREGA_LOCAL" } } } },
    },
  });
  if (!previous?.vendedor.motoboy) throw new AppError("Atendimento anterior de motoboy nao encontrado", 404);
  if (serviceTypeId && previous.servico_vendedor.tipo_servico_id !== Number(serviceTypeId)) {
    throw new AppError("O tipo de corrida precisa ser o mesmo do atendimento anterior", 400);
  }
  const address = await repository.getUserBaseAddress(userId);
  const services = await repository.findSellerServices({
    include: { vendedor: { include: { motoboy: true } } },
    where: {
      id: previous.servico_vendedor_id, disponivel_agora: true, status: "ATIVO", excluido_em: null,
      tipo_servico: { is: { status: "ATIVO", excluido_em: null } },
      vendedor: {
        excluido_em: null, status: "ATIVO", status_kyc: "APROVADO",
        usuario: { is: commercialTier2UserWhere },
        motoboy: { is: {
          status: "ATIVO", cidade_base: { equals: address.cidade, mode: "insensitive" },
          estado_base: { equals: address.estado, mode: "insensitive" },
          OR: [{ aceita_chamadas_plataforma: true }, { lojas: { none: { ativo: true } } }],
        } },
      },
    },
  });
  const service = services[0];
  const busy = Boolean(service && await isCourierSellerBusy(repository, service.vendedor_id));
  return {
    available: Boolean(service) && !busy,
    online: Boolean(service), busy,
    courierId: previous.vendedor.motoboy.id,
    userId: previous.vendedor.usuario_id,
    service,
  };
}

export function assertSameCourierRequest(request, target) {
  const courierId = request?.status === "ACEITA" ? request.motoboy_aceite_id : request?.motoboy_direcionado_id;
  if (target && request && courierId !== target.courierId) {
    throw new AppError("Voce ja tem outra chamada em andamento. Cancele ou conclua antes de chamar este motoboy.", 409);
  }
}
