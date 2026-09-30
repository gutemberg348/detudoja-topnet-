import { Ban, CircleAlert, Eye, RefreshCw, RotateCcw, Search, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getAdminPayments,
  refreshAdminRefund,
  refundAdminPayment,
  approveSandboxPayment,
  getAdminPaymentDetails,
  cancelAdminPayment,
  archiveAdminPayment,
} from "../services/admin.api";

const statusLabels = {
  AGUARDANDO_PAGAMENTO: "Aguardando",
  CANCELADO: "Cancelado",
  EM_DISPUTA: "Estorno solicitado",
  EM_RECONCILIACAO: "Em conciliacao",
  ESTORNADO: "Estornado",
  FALHOU: "Falhou",
  LIQUIDADO: "Liquidado",
  PAGO: "Pago",
  PENDENTE: "Pendente",
};

function money(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" })
    .format(Number(cents) / 100);
}

function dateTime(value) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
      .format(new Date(value))
    : "-";
}

function statusTone(status) {
  if (["PAGO", "LIQUIDADO", "ESTORNADO"].includes(status)) return "success";
  if (["AGUARDANDO_PAGAMENTO", "PENDENTE", "EM_DISPUTA"].includes(status)) return "warning";
  return "danger";
}

export function PaymentsPage({ accessToken, canRefundPayments = false }) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [processingId, setProcessingId] = useState(null);
  const [refundPayment, setRefundPayment] = useState(null);
  const [refundReason, setRefundReason] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [sandboxPayment, setSandboxPayment] = useState(null);
  const [sandboxReason, setSandboxReason] = useState("");
  const [sandboxConfirmation, setSandboxConfirmation] = useState("");
  const [receiveGateway, setReceiveGateway] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [cancelPayment, setCancelPayment] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [archivePayment, setArchivePayment] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await getAdminPayments(accessToken, { search, status, archived, page });
      setPayments(response.payments ?? []);
      setPagination(response.pagination ?? { page: 1, totalPages: 1, total: 0 });
      setSandboxEnabled(Boolean(response.sandboxApprovalEnabled));
      setReceiveGateway(response.receiveGateway ?? null);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar os pagamentos.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, search, status, archived, page]);

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  function openRefund(payment) {
    setRefundPayment(payment);
    setRefundReason("");
    setError("");
  }

  function closeRefund() {
    if (!processingId) {
      setRefundPayment(null);
      setRefundReason("");
    }
  }

  async function refund(event) {
    event.preventDefault();
    if (!refundPayment) return;

    setProcessingId(refundPayment.id);
    setError("");
    try {
      await refundAdminPayment(accessToken, refundPayment.id, refundReason.trim());
      setRefundPayment(null);
      await load();
      if (details?.payment.id === refundPayment.id) await openDetails(refundPayment.id);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel solicitar o estorno.");
    } finally {
      setProcessingId(null);
    }
  }

  async function refreshRefund(payment) {
    setProcessingId(payment.id);
    setError("");
    try {
      await refreshAdminRefund(accessToken, payment.id);
      await load();
      if (details?.payment.id === payment.id) await openDetails(payment.id);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel consultar o gateway.");
    } finally {
      setProcessingId(null);
    }
  }

  async function approveSandbox(event) {
    event.preventDefault();
    if (!sandboxPayment || processingId) return;
    setProcessingId(sandboxPayment.id);
    setError("");
    try {
      await approveSandboxPayment(accessToken, sandboxPayment.id, {
        action: sandboxPayment.sandboxRefundable ? "refund" : "pay",
        confirmation: sandboxConfirmation.trim(), reason: sandboxReason.trim(),
      });
      setSandboxPayment(null);
      await load();
      if (details?.payment.id === sandboxPayment.id) await openDetails(sandboxPayment.id);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel aprovar o teste.");
    } finally { setProcessingId(null); }
  }

  async function openDetails(paymentId) {
    setDetailsLoading(true);
    setError("");
    try { setDetails(await getAdminPaymentDetails(accessToken, paymentId)); }
    catch (requestError) { setError(requestError.message ?? "Nao foi possivel abrir a transacao."); }
    finally { setDetailsLoading(false); }
  }

  async function submitCancel(event) {
    event.preventDefault();
    if (!cancelPayment || cancelReason.trim().length < 8) return;
    setProcessingId(cancelPayment.id);
    setError("");
    try {
      await cancelAdminPayment(accessToken, cancelPayment.id, cancelReason.trim());
      const paymentId = cancelPayment.id;
      setCancelPayment(null);
      setCancelReason("");
      await load();
      if (details?.payment.id === paymentId) await openDetails(paymentId);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cancelar a cobranca.");
    } finally { setProcessingId(null); }
  }

  async function submitArchive(event) {
    event.preventDefault();
    if (!archivePayment || archiveReason.trim().length < 8) return;
    setProcessingId(archivePayment.id);
    setError("");
    try {
      await archiveAdminPayment(accessToken, archivePayment.id, !archivePayment.archivedAt, archiveReason.trim());
      setArchivePayment(null);
      setArchiveReason("");
      setDetails(null);
      await load();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar o arquivo.");
    } finally { setProcessingId(null); }
  }

  return (
    <div className="page-content payments-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">CONTROLE FINANCEIRO</p>
          <h1>Pagamentos e estornos</h1>
          <p>Localize pelo pedido, cliente ou loja. O valor sempre volta para a origem registrada.</p>
        </div>
        <button className="button button--secondary" onClick={load} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <section className="payments-policy">
        <WalletCards size={21} />
        <div>
          <strong>Regra operacional</strong>
          <p>O estorno devolve para a origem registrada. Carteiras retornam na hora; Pix fica em processamento ate a confirmacao do gateway. Ganhos vinculados sao revertidos junto.</p>
        </div>
      </section>

      <section className={`payments-gateway payments-gateway--${receiveGateway === "SICREDI" ? "sicredi" : "fallback"}`}>
        <span className="payments-gateway__dot" />
        <div><strong>Novos Pix: {receiveGateway === "SICREDI" ? "Sicredi" : receiveGateway === "ASAAS" ? "Asaas" : "nenhum gateway pronto"}</strong>
          <p>{receiveGateway === "SICREDI" ? "A cobranca Pix de recebimento esta habilitada para novas transacoes." : "O Multipag nao gera cobrancas Pix de recebimento. Para usar Sicredi aqui, configure e habilite a API Pix de cobranca na VPS."} Pagamentos antigos permanecem no gateway em que foram criados.</p>
        </div>
      </section>

      <div className="payments-toolbar">
        <label className="payments-search">
          <Search size={17} />
          <input onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Pedido, cliente, e-mail ou loja" value={search} />
        </label>
        <select onChange={(event) => { setPage(1); setStatus(event.target.value); }} value={status}>
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="payments-archive-filter"><input type="checkbox" checked={archived} onChange={(event) => { setPage(1); setArchived(event.target.checked); }} /> Ver arquivados</label>
      </div>

      {sandboxEnabled ? <section className="payments-policy"><CircleAlert size={21} /><div>
        <strong>Sandbox: aprovacao manual de testes habilitada</strong>
        <p>A aprovacao movimenta saldos, pedidos e ganhos no sistema. Nao representa dinheiro recebido no banco. Esta base nao pode ser usada em producao.</p>
      </div></section> : null}

      {error ? <div className="form-error">{error}</div> : null}
      <section className="data-section data-section--flush">
        {isLoading ? (
          <div className="page-state">Carregando pagamentos...</div>
        ) : payments.length === 0 ? (
          <div className="empty-state"><WalletCards size={30} /><p>Nenhum pagamento encontrado.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="payments-table">
              <thead><tr><th>Pagamento</th><th>Cliente</th><th>Destino</th><th>Valor</th><th>Status</th><th>Acao</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td><span className="table-primary">#{payment.id} {payment.orderCode ? `· ${payment.orderCode}` : ""}</span><span className="table-secondary">{dateTime(payment.paidAt ?? payment.createdAt)} · {payment.gateway}</span></td>
                    <td><span className="table-primary">{payment.payer?.name ?? "Cliente"}</span><span className="table-secondary">{payment.payer?.email}</span></td>
                    <td><span className="table-primary">{payment.store?.name ?? "Venda autonoma"}</span><span className="table-secondary">{payment.method}</span></td>
                    <td><span className="payment-value">{money(payment.totalCents)}</span><span className="table-secondary">Saldo {money(payment.walletCents)} · Pix {money(payment.pixCents)}</span></td>
                    <td><span className={`status-badge status-badge--${statusTone(payment.status)}`}>{statusLabels[payment.status] ?? payment.status}</span></td>
                    <td><div className="payments-actions">
                      <button className="button button--secondary" disabled={detailsLoading} type="button" onClick={() => openDetails(payment.id)}><Eye size={15} /> Ver detalhes</button>
                      {payment.sandboxSimulated ? <span className="table-secondary">Simulado pelo admin · Sandbox</span> : null}
                      {canRefundPayments && (payment.sandboxApprovable || payment.sandboxRefundable) ? (
                        <button className="button button--secondary" disabled={Boolean(processingId)} type="button" onClick={() => {
                          setSandboxPayment(payment); setSandboxReason(""); setSandboxConfirmation(""); setError("");
                        }}>{payment.sandboxRefundable ? "Confirmar estorno de teste" : "Aprovar pagamento de teste"}</button>
                      ) : null}
                      {canRefundPayments && payment.cancelable ? (
                        <button className="button button--secondary" disabled={Boolean(processingId)} type="button" onClick={() => { setCancelPayment(payment); setCancelReason(""); }}><Ban size={15} /> Cancelar cobrança</button>
                      ) : null}
                      {canRefundPayments && payment.status === "EM_DISPUTA" && !payment.sandboxRefundable ? (
                        <button className="button button--secondary" disabled={processingId === payment.id} onClick={() => refreshRefund(payment)} type="button">
                          <RefreshCw className={processingId === payment.id ? "spin" : ""} size={15} /> Consultar gateway
                        </button>
                      ) : null}
                      {canRefundPayments && payment.refundable ? (
                        <button
                          className="button button--secondary"
                          disabled={processingId === payment.id}
                          onClick={() => openRefund(payment)}
                          title="Solicitar estorno financeiro"
                          type="button"
                        >
                          <RotateCcw size={15} /> {processingId === payment.id ? "Processando" : "Estornar"}
                        </button>
                      ) : null}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pagination.totalPages > 1 ? <nav className="payments-pagination" aria-label="Paginas de pagamentos">
        <button className="button button--secondary" type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <span>Pagina {pagination.page} de {pagination.totalPages} · {pagination.total} pagamentos</span>
        <button className="button button--secondary" type="button" disabled={page >= pagination.totalPages || isLoading} onClick={() => setPage((value) => value + 1)}>Proxima</button>
      </nav> : null}

      {details ? <div className="modal-backdrop" onMouseDown={() => setDetails(null)}>
        <section className="modal payment-details" role="dialog" aria-modal="true" aria-labelledby="payment-details-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal__header">
            <div><p className="eyebrow">RASTREIO DA TRANSACAO</p><h2 id="payment-details-title">Pagamento #{details.payment.id}</h2></div>
            <button className="icon-button" type="button" onClick={() => setDetails(null)} aria-label="Fechar"><X size={19} /></button>
          </div>
          <div className="payment-details__hero">
            <strong>{money(details.payment.totalCents)}</strong>
            <span className={`status-badge status-badge--${statusTone(details.payment.status)}`}>{statusLabels[details.payment.status] ?? details.payment.status}</span>
            <small>{details.payment.gateway} · {details.payment.gatewayEnvironment ?? "ambiente nao informado"} · {details.payment.gatewayPaymentId ?? "sem ID no gateway"}</small>
          </div>
          <div className="payment-details__facts">
            <div><span>Cliente</span><strong>{details.payment.payer?.name ?? "—"}</strong><small>{details.payment.payer?.email}</small></div>
            <div><span>Destino</span><strong>{details.payment.store?.name ?? (details.deposit ? "Deposito em carteira" : "Pagamento avulso")}</strong><small>{details.payment.orderCode ? `Pedido ${details.payment.orderCode}` : "Sem pedido de loja"}</small></div>
            <div><span>Datas</span><strong>Criado {dateTime(details.payment.createdAt)}</strong><small>Pago {dateTime(details.payment.paidAt)} · Estornado {dateTime(details.payment.refundedAt)}</small></div>
          </div>
          <h3>Origem do valor</h3>
          <div className="payment-details__rows">
            <div><span>Pix</span><strong>{money(details.payment.pixCents)}</strong></div>
            <div><span>Saldo das carteiras</span><strong>{money(details.payment.walletCents)}</strong></div>
            {details.sources.map((source) => <div key={source.id}><span>{source.walletType ?? source.type} · {source.status}</span><strong>{money(source.amountCents)}</strong></div>)}
          </div>
          {details.items.length ? <><h3>Itens</h3><div className="payment-details__rows">
            {details.items.map((item) => <div key={item.id}><span>{item.quantity}× {item.name}</span><strong>{money(item.totalCents)}</strong></div>)}
          </div></> : null}
          {details.deposit ? <><h3>Deposito em carteira</h3><div className="payment-details__rows"><div><span>{details.deposit.walletType ?? "Carteira"} · {details.deposit.status}</span><strong>{money(details.deposit.creditedCents)}</strong></div></div></> : null}
          {details.settlement ? <>
            <h3>Distribuicao da transacao #{details.settlement.id} · {details.settlement.status}</h3>
            <div className="payment-details__rows">
              <div><span>Bruto</span><strong>{money(details.settlement.grossCents)}</strong></div>
              <div><span>Liquido previsto para loja</span><strong>{money(details.settlement.sellerNetCents)}</strong></div>
              <div><span>Taxa da plataforma</span><strong>{money(details.settlement.platformFeeCents)}</strong></div>
              <div><span>Taxa de processamento</span><strong>{money(details.settlement.processingFeeCents)}</strong></div>
              <div><span>Cashback prioritario</span><strong>{money(details.settlement.cashbackCents)}</strong></div>
              <div><span>Pool de recompensas</span><strong>{money(details.settlement.rewardsPoolCents)}</strong></div>
              <div><span>Empresa</span><strong>{money(details.settlement.companyCents)}</strong></div>
            </div>
            <p className="payment-details__hint">Valores previstos no calculo nao significam que ja foram liberados ou enviados. Confira o status de cada lancamento abaixo.</p>
            <h3>Para quem foi</h3>
            {details.settlement.receivables.length || details.settlement.rewards.length || details.settlement.platformEntries.length ? <div className="payment-details__rows">
              {details.settlement.receivables.map((item) => <div key={`rec-${item.id}`}><span>Recebivel · {item.type} · {item.recipient?.name ?? item.recipient?.nome} · {item.status}</span><strong>{money(item.netCents)}</strong></div>)}
              {details.settlement.rewards.map((item) => <div key={`rew-${item.id}`}><span>{item.type} · {item.recipient?.nome} · {item.status}</span><strong>{money(item.amountCents)}</strong></div>)}
              {details.settlement.platformEntries.map((item) => <div key={`pla-${item.id}`}><span>{item.account ?? item.accountType} · {item.type} · {item.status}</span><strong>{money(item.amountCents)}</strong></div>)}
            </div> : <p className="payment-details__hint">Ainda nao ha ganhos registrados para esta transacao.</p>}
            <h3>Repasse Pix</h3><p className="payment-details__hint">{details.settlement.transfer ? `${details.settlement.transfer.gateway} · ${details.settlement.transfer.status} · ${money(details.settlement.transfer.amountCents)} · Pago ${dateTime(details.settlement.transfer.paidAt)}` : "Nenhum repasse Pix registrado."}</p>
          </> : <p className="payment-details__hint">Ainda nao houve distribuicao de ganhos para este pagamento.</p>}
          {details.walletEntries.length ? <><h3>Lancamentos nas carteiras</h3><div className="payment-details__rows">
            {details.walletEntries.map((item) => <div key={`wallet-${item.id}`}><span>{item.type} · {item.origin} · {item.recipient?.nome ?? "Usuario"} · {item.walletType ?? "Carteira"} · {item.status}</span><strong>{money(item.amountCents)}</strong></div>)}
          </div></> : null}
          {details.events.length ? <><h3>Historico financeiro</h3><div className="payment-details__events">{details.events.map((item) => <div key={item.id}><strong>{item.type}</strong><span>{item.description ?? ""}</span><small>{dateTime(item.at)}</small></div>)}</div></> : null}
          <p className="payment-details__hint">Registros financeiros nao podem ser apagados; use cancelamento antes do pagamento ou estorno apos a confirmacao.</p>
          {canRefundPayments && ["CANCELADO", "ESTORNADO", "FALHOU"].includes(details.payment.status) ? <div className="modal__actions">
            <button className="button button--secondary" type="button" onClick={() => { setArchivePayment(details.payment); setArchiveReason(""); }}>
              {details.payment.archivedAt ? "Restaurar na lista" : "Excluir da lista (arquivar)"}
            </button>
          </div> : null}
        </section>
      </div> : null}

      {archivePayment ? <div className="modal-backdrop" onMouseDown={() => !processingId && setArchivePayment(null)}>
        <section className="modal refund-modal" role="dialog" aria-modal="true" aria-labelledby="archive-payment-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal__header"><h2 id="archive-payment-title">{archivePayment.archivedAt ? "Restaurar" : "Arquivar"} pagamento #{archivePayment.id}</h2><button className="icon-button" type="button" disabled={Boolean(processingId)} onClick={() => setArchivePayment(null)} aria-label="Fechar"><X size={19} /></button></div>
          <p>{archivePayment.archivedAt ? "A transacao voltara para a lista principal." : "A transacao sai da lista principal, mas o historico e os ganhos permanecem registrados para auditoria. Ela ficara no filtro Arquivados."}</p>
          <form className="refund-form" onSubmit={submitArchive}>
            <label>Motivo<textarea required minLength={8} maxLength={500} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} /></label>
            {error ? <div className="form-error">{error}</div> : null}
            <div className="modal__actions"><button className="button button--secondary" type="button" disabled={Boolean(processingId)} onClick={() => setArchivePayment(null)}>Voltar</button><button className="button button--primary" disabled={Boolean(processingId) || archiveReason.trim().length < 8} type="submit">Confirmar</button></div>
          </form>
        </section>
      </div> : null}

      {cancelPayment ? <div className="modal-backdrop" onMouseDown={() => !processingId && setCancelPayment(null)}>
        <section className="modal refund-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-payment-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal__header"><h2 id="cancel-payment-title">Cancelar cobranca #{cancelPayment.id}</h2><button className="icon-button" type="button" disabled={Boolean(processingId)} onClick={() => setCancelPayment(null)} aria-label="Fechar"><X size={19} /></button></div>
          <p>So e permitido enquanto o pedido aguarda pagamento. A cobranca sera cancelada no gateway e o pedido sera liberado, sem apagar o historico.</p>
          <form className="refund-form" onSubmit={submitCancel}>
            <label>Motivo<textarea required minLength={8} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>
            {error ? <div className="form-error">{error}</div> : null}
            <div className="modal__actions"><button className="button button--secondary" type="button" disabled={Boolean(processingId)} onClick={() => setCancelPayment(null)}>Voltar</button><button className="button button--danger" disabled={Boolean(processingId) || cancelReason.trim().length < 8} type="submit">Confirmar cancelamento</button></div>
          </form>
        </section>
      </div> : null}

      {sandboxPayment ? <div className="modal-backdrop">
        <section className="modal refund-modal" role="dialog" aria-modal="true" aria-labelledby="sandbox-payment-title">
          <div className="modal__header"><h2 id="sandbox-payment-title">Confirmar {sandboxPayment.sandboxRefundable ? "estorno" : "pagamento"} de teste</h2>
            <button className="icon-button" type="button" disabled={Boolean(processingId)} onClick={() => setSandboxPayment(null)} aria-label="Fechar"><X size={19} /></button>
          </div>
          <div className="refund-summary"><span>Pagamento #{sandboxPayment.id} · {sandboxPayment.gateway} · Sandbox</span><strong>{money(sandboxPayment.totalCents)}</strong></div>
          <p>O fluxo normal sera executado, incluindo saldo e atualizacoes no app. Nenhum recebimento ou estorno bancario real e comprovado por esta acao.</p>
          <form className="refund-form" onSubmit={approveSandbox}>
            <label>Motivo do teste<textarea required minLength={8} maxLength={500} value={sandboxReason} onChange={(event) => setSandboxReason(event.target.value)} /></label>
            <label>Digite CONFIRMO_SANDBOX<input required value={sandboxConfirmation} onChange={(event) => setSandboxConfirmation(event.target.value)} autoComplete="off" /></label>
            {error ? <div className="form-error">{error}</div> : null}
            <button className="button button--primary" type="submit" disabled={Boolean(processingId) || sandboxConfirmation.trim() !== "CONFIRMO_SANDBOX" || sandboxReason.trim().length < 8}>
              {processingId ? "Processando..." : "Confirmar simulacao"}
            </button>
          </form>
        </section>
      </div> : null}

      {refundPayment ? (
        <div className="modal-backdrop" onMouseDown={closeRefund}>
          <section
            aria-labelledby="refund-modal-title"
            aria-modal="true"
            className="modal refund-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal__header">
              <div>
                <p className="eyebrow">REVISAO FINANCEIRA</p>
                <h2 id="refund-modal-title">Aprovar estorno</h2>
              </div>
              <button className="icon-button" disabled={Boolean(processingId)} onClick={closeRefund} title="Fechar" type="button">
                <X size={19} />
              </button>
            </div>

            <div className="refund-summary">
              <span>Pagamento #{refundPayment.id}</span>
              <strong>{money(refundPayment.totalCents)}</strong>
              <small>{refundPayment.store?.name ?? "Venda autonoma"}</small>
            </div>

            <div className="refund-destination">
              <CircleAlert size={18} />
              <p>
                {refundPayment.sandboxSimulated
                  ? "Este pagamento foi aprovado manualmente no Sandbox. Solicite o estorno e depois confirme o estorno de teste no painel; nenhum dinheiro sera enviado pelo banco."
                  : refundPayment.refundDestination === "PIX_ORIGEM"
                  ? "O gateway recebera a solicitacao de devolucao para o Pix de origem. A baixa final depende da confirmacao do gateway."
                  : "O valor volta imediatamente para as mesmas carteiras usadas pelo cliente."}
                {refundPayment.settlementStatus === "LIQUIDADA"
                  ? " Os recebiveis, cashback, indicacoes, rede e receita da plataforma tambem serao revertidos na mesma operacao."
                  : ""}
              </p>
            </div>

            <form className="refund-form" onSubmit={refund}>
              <label>
                Motivo do estorno
                <textarea
                  autoFocus
                  maxLength={500}
                  minLength={8}
                  onChange={(event) => setRefundReason(event.target.value)}
                  placeholder="Ex.: cancelamento solicitado pelo cliente, item indisponivel..."
                  required
                  rows={4}
                  value={refundReason}
                />
              </label>
              <div className="modal__actions">
                <button className="button button--secondary" disabled={Boolean(processingId)} onClick={closeRefund} type="button">Cancelar</button>
                <button className="button button--danger" disabled={processingId === refundPayment.id || refundReason.trim().length < 8} type="submit">
                  <RotateCcw size={15} /> {processingId === refundPayment.id ? "Processando..." : "Aprovar estorno"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
