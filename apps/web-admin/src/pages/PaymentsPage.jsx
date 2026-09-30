import { Archive, ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, Eye, ReceiptText, RefreshCw, Search, WalletCards } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { approveSandboxPayment, archiveAdminPayment, cancelAdminPayment, getAdminPaymentDetails, getAdminPayments, refreshAdminRefund, refundAdminPayment } from "../services/admin.api";
import { PaymentDetails } from "./payments/PaymentDetails";
import { actionAvailability, CloseButton, dateTime, money, PaymentDialog, personName, StatusBadge, statusLabels } from "./payments/paymentPresentation";
import "./payments/payments.css";

const actionText = {
  pay: { title: "Marcar pagamento como pago", button: "Confirmar pagamento de teste", description: "A aprovação no Sandbox confirma o pagamento e executa as atualizações de pedido ou saldo no app. Ela fica registrada como simulação administrativa." },
  cancel: { title: "Cancelar cobrança", button: "Confirmar cancelamento", description: "O Pix e o pedido que aguarda pagamento serão cancelados. A parcela já usada de carteiras será devolvida pelo fluxo de cancelamento." },
  refund: { title: "Estornar pagamento", button: "Solicitar estorno", description: "O valor será devolvido à origem registrada. O fluxo também reverte os ganhos vinculados que ainda podem ser estornados. A devolução Pix depende da confirmação do gateway." },
  confirmRefund: { title: "Confirmar estorno de teste", button: "Confirmar estorno no Sandbox", description: "Conclui o estorno simulado deste pagamento e atualiza os registros financeiros no app." },
  archive: { title: "Excluir pagamento da lista", button: "Arquivar pagamento", description: "O pagamento encerrado ficará em Arquivados. Os valores, os beneficiários e o histórico continuam disponíveis para consulta." },
};

export function PaymentsPage({ accessToken, canRefundPayments = false }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [receiveGateway, setReceiveGateway] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true); setError("");
    try {
      const response = await getAdminPayments(accessToken, { search, status, archived, page });
      if (request !== listRequest.current) return;
      const nextPagination = response.pagination ?? { page: 1, totalPages: 1, total: 0 };
      setPayments(response.payments ?? []); setPagination(nextPagination);
      setSandboxEnabled(Boolean(response.sandboxApprovalEnabled));
      setReceiveGateway(response.receiveGateway ?? null);
      if (page > Math.max(1, nextPagination.totalPages)) setPage(Math.max(1, nextPagination.totalPages));
    } catch (err) { if (request === listRequest.current) setError(err.message ?? "Não foi possível carregar os pagamentos."); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, [accessToken, search, status, archived, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => { clearTimeout(timer); listRequest.current += 1; };
  }, [load]);
  useEffect(() => () => { detailRequest.current += 1; }, []);

  async function openDetails(id, preserve = false) {
    const request = ++detailRequest.current;
    setDetailId(id); setDetailLoading(true); setDetailError("");
    if (!preserve) setDetails(null);
    try {
      const response = await getAdminPaymentDetails(accessToken, id);
      if (request === detailRequest.current) setDetails(response);
    } catch (err) { if (request === detailRequest.current) setDetailError(err.message ?? "Não foi possível abrir o pagamento."); }
    finally { if (request === detailRequest.current) setDetailLoading(false); }
  }
  function closeDetails() { detailRequest.current += 1; setDetailId(null); setDetails(null); }
  function openAction(kind, payment) {
    setAction({ kind, payment }); setReason(""); setConfirmation(""); setActionError(""); setNotice("");
  }
  async function submitAction(event) {
    event.preventDefault();
    if (!action || busy || reason.trim().length < 8) return;
    const { kind, payment } = action;
    setBusy(true); setActionError("");
    try {
      if (kind === "pay" || kind === "confirmRefund") await approveSandboxPayment(accessToken, payment.id, { action: kind === "pay" ? "pay" : "refund", reason: reason.trim(), confirmation: confirmation.trim() });
      else if (kind === "cancel") await cancelAdminPayment(accessToken, payment.id, reason.trim());
      else if (kind === "refund") await refundAdminPayment(accessToken, payment.id, reason.trim());
      else if (kind === "archive") await archiveAdminPayment(accessToken, payment.id, !payment.archivedAt, reason.trim());
      setAction(null);
      setNotice(kind === "refund" ? `Solicitação de estorno do pagamento #${payment.id} registrada. Acompanhe o status.` : `Pagamento #${payment.id} atualizado com sucesso.`);
      await load();
      if (detailId === payment.id) await openDetails(payment.id, true);
    } catch (err) { setActionError(err.message ?? "Não foi possível concluir a operação."); }
    finally { setBusy(false); }
  }
  async function refreshRefund(payment) {
    setBusy(true); setError("");
    try {
      await refreshAdminRefund(accessToken, payment.id);
      setNotice(`Consulta do estorno #${payment.id} concluída.`);
      await load();
      if (detailId === payment.id) await openDetails(payment.id, true);
    } catch (err) {
      const message = err.message ?? "Não foi possível consultar o estorno.";
      if (detailId) setDetailError(message); else setError(message);
    } finally { setBusy(false); }
  }

  const paid = payments.filter((item) => ["PAGO", "LIQUIDADO"].includes(item.status));
  const pending = payments.filter((item) => ["PENDENTE", "AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"].includes(item.status));
  const refunds = payments.filter((item) => ["EM_DISPUTA", "ESTORNADO"].includes(item.status));
  const total = (items) => items.reduce((value, item) => value + Number(item.totalCents), 0);
  const metrics = [
    { title: "Volume listado", value: total(payments), count: payments.length, icon: WalletCards, tone: "neutral" },
    { title: "Pagamentos confirmados", value: total(paid), count: paid.length, icon: ArrowDownLeft, tone: "green" },
    { title: "Aguardando confirmação", value: total(pending), count: pending.length, icon: Clock3, tone: "amber" },
    { title: "Em estorno / estornados", value: total(refunds), count: refunds.length, icon: ArrowUpRight, tone: "violet" },
  ];
  const sandboxAction = ["pay", "confirmRefund"].includes(action?.kind);
  const modalText = action ? action.kind === "archive" && action.payment.archivedAt
    ? { title: "Restaurar pagamento", button: "Restaurar na lista", description: "Este pagamento voltará para a lista principal com seu histórico preservado." }
    : actionText[action.kind] : null;

  return <div className="page-content pay-page">
    <div inert={Boolean(detailId || action) || undefined}>
    <header className="pay-heading"><div><span className="pay-eyebrow">CONTROLE FINANCEIRO</span><h1>Pagamentos</h1><p>Gerencie cada pagamento e acompanhe o caminho de cada valor.</p></div><button className="button button--secondary" disabled={loading || busy} type="button" onClick={load}><RefreshCw size={17} className={loading ? "spin" : ""} />Atualizar</button></header>
    <div className="pay-environment"><span><i className={receiveGateway ? "is-ready" : ""} />Novos Pix: <strong>{receiveGateway ?? "gateway indisponível"}</strong></span>{sandboxEnabled && <span className="pay-sandbox-tag">Sandbox · aprovação manual ativa</span>}</div>
    <div className="pay-metrics-label">Resumo dos pagamentos nesta página</div><div className="pay-metrics" aria-busy={loading}>{metrics.map(({ title, value, count, icon: Icon, tone }) => <article className={`pay-metric pay-metric--${tone}`} key={title}><div><span>{title}</span><Icon size={20} /></div><strong>{loading ? "—" : money(value)}</strong><small>{loading ? "Atualizando…" : `${count} pagamento(s)`}</small></article>)}</div>
    {sandboxEnabled && <div className="pay-sandbox-note"><Check size={17} /><p>Use <strong>Marcar como pago</strong> nos Pix pendentes de Sandbox para testar pedidos e saldos no app. A aprovação fica identificada no histórico.</p></div>}
    {notice && <div className="pay-notice" role="status"><Check size={18} />{notice}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="pay-list">
      <div className="pay-list-header"><div className="pay-list-switch"><button type="button" aria-pressed={!archived} onClick={() => { setArchived(false); setPage(1); }}>Todos os pagamentos</button><button type="button" aria-pressed={archived} onClick={() => { setArchived(true); setPage(1); }}><Archive size={15} />Arquivados</button></div><span>{pagination.total} registro(s)</span></div>
      <div className="pay-toolbar"><label className="pay-search"><Search size={19} /><input aria-label="Buscar pagamento" value={search} placeholder="Buscar por número, pedido, pessoa ou loja…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filtrar por status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></div>
      {loading ? <div className="pay-empty"><RefreshCw className="spin" size={24} /><p>Carregando pagamentos…</p></div> : payments.length ? <div className="pay-table-wrap"><table className="pay-table"><thead><tr><th>Pagamento</th><th>Quem pagou</th><th>Destino</th><th>Valor</th><th>Status</th><th>Gerenciar</th></tr></thead><tbody>{payments.map((payment) => {
        const primary = actionAvailability(payment, canRefundPayments, sandboxEnabled).find((item) => item.enabled && item.key !== "archive");
        return <tr key={payment.id}>
          <td data-label="Pagamento"><button className="pay-reference" type="button" onClick={() => openDetails(payment.id)}>#{payment.id}<span>{payment.orderCode ?? "Pagamento avulso"}</span></button><small>{dateTime(payment.createdAt)}</small><span className="pay-gateway-tag">{payment.gateway}{payment.gatewayEnvironment === "sandbox" ? " · Sandbox" : ""}</span></td>
          <td data-label="Quem pagou"><strong>{personName(payment.payer)}</strong><small>{payment.payer?.email}</small></td>
          <td data-label="Destino"><strong>{payment.store?.name ?? "Carteira / venda avulsa"}</strong><small>{payment.method}</small></td>
          <td data-label="Valor"><strong className="pay-table-amount">{money(payment.totalCents)}</strong><small>Pix {money(payment.pixCents)}</small><small>Carteiras {money(payment.walletCents)}</small></td>
          <td data-label="Status"><StatusBadge status={payment.status} />{payment.sandboxSimulated && <small>Aprovado pelo admin</small>}</td>
          <td data-label="Gerenciar"><div className="pay-row-actions"><button className="pay-open" type="button" onClick={() => openDetails(payment.id)}><Eye size={17} />Abrir pagamento<ChevronRight size={15} /></button>{primary && <button className="pay-quick-action" disabled={busy} type="button" onClick={() => openAction(primary.key, payment)}>{primary.title}</button>}{canRefundPayments && payment.status === "EM_DISPUTA" && <button className="pay-quick-action" type="button" disabled={busy} onClick={() => payment.sandboxRefundable ? openAction("confirmRefund", payment) : refreshRefund(payment)}>{payment.sandboxRefundable ? "Confirmar estorno de teste" : "Consultar estorno"}</button>}</div></td>
        </tr>;
      })}</tbody></table></div> : <div className="pay-empty"><ReceiptText size={32} /><h3>Nenhum pagamento encontrado</h3><p>Tente outro nome, número ou status.</p>{(search || status) && <button type="button" className="button button--secondary" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}>Limpar filtros</button>}</div>}
      <footer className="pay-pagination"><span>Página {pagination.page} de {Math.max(1, pagination.totalPages)} · {pagination.total} registro(s)</span><div><button type="button" aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Próxima página" disabled={page >= pagination.totalPages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></footer>
    </section>
    </div>
    {detailId && <PaymentDetails key={detailId} details={details} loading={detailLoading} error={detailError} onClose={closeDetails} onRetry={() => openDetails(detailId, true)} onAction={openAction} onRefreshRefund={refreshRefund} canManage={canRefundPayments} sandboxEnabled={sandboxEnabled} busy={busy} inert={Boolean(action)} />}
    {action && <PaymentDialog titleId="payment-action-title" className="pay-backdrop--action" busy={busy} onClose={() => setAction(null)}>
      <header className="pay-dialog-header"><div><span className="pay-eyebrow">PAGAMENTO #{action.payment.id}</span><h2 id="payment-action-title">{modalText.title}</h2></div><CloseButton disabled={busy} onClick={() => setAction(null)} /></header>
      <form className="pay-confirm-form" onSubmit={submitAction}><div className="pay-confirm-summary"><strong>{money(action.payment.totalCents)}</strong><StatusBadge status={action.payment.status} /><span>{personName(action.payment.payer)} · {action.payment.store?.name ?? "Pagamento avulso"}</span></div><p>{action.kind === "refund" && action.payment.sandboxSimulated ? "Este pagamento foi aprovado manualmente no Sandbox. Solicite o estorno e, em seguida, use Confirmar estorno de teste para concluir a devolução simulada." : modalText.description}</p>
        <label>Motivo da operação<textarea required minLength={8} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o motivo para registrar no histórico" disabled={busy} /></label>
        {sandboxAction && <label>Digite CONFIRMO_SANDBOX<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} /></label>}
        {actionError && <div className="form-error" role="alert">{actionError}</div>}
        <div className="pay-confirm-footer"><button className="button button--secondary" type="button" disabled={busy} onClick={() => setAction(null)}>Voltar</button><button className={`button ${["cancel", "refund"].includes(action.kind) ? "button--danger" : "button--primary"}`} type="submit" disabled={busy || reason.trim().length < 8 || (sandboxAction && confirmation.trim() !== "CONFIRMO_SANDBOX")}>{busy ? "Processando…" : modalText.button}</button></div>
      </form>
    </PaymentDialog>}
  </div>;
}
