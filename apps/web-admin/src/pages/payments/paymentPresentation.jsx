import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export const statusLabels = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento", PENDENTE: "Pendente", PAGO: "Pago",
  LIQUIDADO: "Liquidado", CANCELADO: "Cancelado", ESTORNADO: "Estornado", FALHOU: "Falhou",
  EM_DISPUTA: "Estorno em andamento", EM_RECONCILIACAO: "Em conciliação",
};
const labels = {
  ...statusLabels, PAGA: "Paga", VALIDADA: "Ganhos calculados", LIQUIDADA: "Ganhos liberados",
  ESTORNADA: "Estornada", CANCELADA: "Cancelada", BLOQUEADA: "Bloqueada", BLOQUEADO: "Bloqueado",
  LIBERADA: "Liberada", DISPONIVEL: "Disponível", PROCESSADO: "Processado", CONFIRMADO: "Confirmado",
  RECEBIDO: "Recebido", ACEITO: "Aceito", EM_PREPARO: "Em preparo", CONCLUIDO: "Concluído",
  CASHBACK_COMPRADOR: "Cashback do comprador", CASHBACK: "Cashback",
  BONUS_INDICACAO_CONSUMIDOR: "Indicação do comprador", BONUS_INDICACAO: "Indicação do comprador",
  BONUS_VENDEDOR: "Indicação do vendedor", BONUS_REDE: "Bônus de rede",
  LOJISTA: "Recebimento da loja", VENDEDOR: "Recebimento do vendedor", AUTONOMO: "Recebimento do profissional",
  CREDITO: "Crédito", DEBITO: "Débito", ESTORNO: "Estorno", VENDA: "Venda",
  SALDO: "Saldo em carteira", INTERNO: "Carteiras", PIX: "Pix", CARTAO: "Cartão",
  PAYMENT_RECEIVED: "Pagamento confirmado", PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_REFUNDED: "Estorno confirmado", PAYMENT_DELETED: "Cobrança cancelada",
  PAGAMENTO_SANDBOX_SIMULADO: "Simulação administrativa", PAGAMENTO_CANCELADO_ADMIN: "Cancelamento administrativo",
  PAGAMENTO_ARQUIVADO_ADMIN: "Pagamento arquivado", PAGAMENTO_RESTAURADO_ADMIN: "Pagamento restaurado",
};
export const label = (value) => labels[value] ?? String(value ?? "Não informado").replaceAll("_", " ").toLocaleLowerCase("pt-BR");
export const money = (cents = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
export const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
export const personName = (person) => person?.name ?? person?.nome ?? "Não informado";

export function StatusBadge({ status }) {
  const tone = ["PAGO", "PAGA", "LIQUIDADO", "LIQUIDADA", "PROCESSADO", "CONFIRMADO", "DISPONIVEL", "LIBERADA"].includes(status)
    ? "green" : ["FALHOU", "CANCELADO", "CANCELADA"].includes(status) ? "red"
      : ["ESTORNADO", "ESTORNADA"].includes(status) ? "neutral" : "amber";
  return <span className={`pay-status pay-status--${tone}`}><i />{label(status)}</span>;
}

export function actionAvailability(payment, canManage, sandboxEnabled) {
  const permission = canManage ? "" : "Seu perfil tem acesso somente à consulta.";
  return [
    { key: "pay", title: "Marcar como pago", enabled: !permission && payment.sandboxApprovable,
      reason: permission || (payment.sandboxApprovable ? "Confirma o pagamento no Sandbox e atualiza o app."
        : ["PAGO", "LIQUIDADO"].includes(payment.status) ? "Este pagamento já está confirmado."
          : !sandboxEnabled ? "Aprovação manual requer Sandbox habilitado."
            : "Requer um Pix pendente identificado como Sandbox.") },
    { key: "cancel", title: "Cancelar cobrança", enabled: !permission && payment.cancelable,
      reason: permission || (payment.cancelable ? "Cancela o Pix e o pedido que aguarda pagamento."
        : ["PAGO", "LIQUIDADO"].includes(payment.status) ? "Para devolver um pagamento confirmado, use Estornar."
          : "Disponível para pedido de loja com Pix criado e ainda não pago.") },
    { key: "refund", title: "Estornar pagamento", enabled: !permission && payment.refundable,
      reason: permission || (payment.refundable ? "Devolve para a origem registrada e reverte os ganhos vinculados."
        : payment.status === "EM_DISPUTA" ? "O estorno já foi solicitado. Acompanhe a confirmação."
          : ["PAGO", "LIQUIDADO"].includes(payment.status) ? "Fora da janela de estorno automático ou ganhos já liquidados. Requer revisão financeira."
            : "Disponível após a confirmação do pagamento.") },
    { key: "archive", title: payment.archivedAt ? "Restaurar na lista" : "Excluir da lista", enabled: !permission && ["CANCELADO", "ESTORNADO", "FALHOU"].includes(payment.status),
      reason: permission || (payment.archivedAt ? "Retorna o pagamento para a lista principal."
        : "Arquiva pagamentos cancelados, estornados ou com falha. O histórico fica preservado.") },
  ];
}

export function PaymentDialog({ children, titleId, onClose, className = "", busy = false, inert = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.body.style.overflow = priorOverflow; previous?.focus?.(); };
  }, []);
  function keyDown(event) {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); closeRef.current(); }
    if (event.key !== "Tab") return;
    const elements = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    const first = elements[0]; const last = elements.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
  }
  return <div className={`pay-backdrop ${className}`} inert={inert || undefined} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="pay-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1} onKeyDown={keyDown}>{children}</section>
  </div>;
}

export function CloseButton({ onClick, disabled }) {
  return <button className="pay-close" type="button" aria-label="Fechar" onClick={onClick} disabled={disabled}><X size={20} /></button>;
}
