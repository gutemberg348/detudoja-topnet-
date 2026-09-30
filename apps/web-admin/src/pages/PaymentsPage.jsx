import { CircleAlert, RefreshCw, RotateCcw, Search, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getAdminPayments,
  refreshAdminRefund,
  refundAdminPayment,
  approveSandboxPayment,
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
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [sandboxPayment, setSandboxPayment] = useState(null);
  const [sandboxReason, setSandboxReason] = useState("");
  const [sandboxConfirmation, setSandboxConfirmation] = useState("");

  const load = useCallback(async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await getAdminPayments(accessToken, { search, status });
      setPayments(response.payments ?? []);
      setSandboxEnabled(Boolean(response.sandboxApprovalEnabled));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar os pagamentos.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, search, status]);

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
      closeRefund();
      await load();
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
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel aprovar o teste.");
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

      <div className="payments-toolbar">
        <label className="payments-search">
          <Search size={17} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Pedido, cliente, e-mail ou loja" value={search} />
        </label>
        <select onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
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
                    <td>
                      {payment.sandboxSimulated ? <span className="table-secondary">Simulado pelo admin · Sandbox</span> : null}
                      {canRefundPayments && (payment.sandboxApprovable || payment.sandboxRefundable) ? (
                        <button className="button button--secondary" disabled={Boolean(processingId)} type="button" onClick={() => {
                          setSandboxPayment(payment); setSandboxReason(""); setSandboxConfirmation(""); setError("");
                        }}>{payment.sandboxRefundable ? "Confirmar estorno de teste" : "Aprovar pagamento de teste"}</button>
                      ) : canRefundPayments && payment.status === "EM_DISPUTA" ? (
                        <button className="button button--secondary" disabled={processingId === payment.id} onClick={() => refreshRefund(payment)} type="button">
                          <RefreshCw className={processingId === payment.id ? "spin" : ""} size={15} /> Consultar gateway
                        </button>
                      ) : canRefundPayments ? (
                        <button
                          className="button button--secondary"
                          disabled={!payment.refundable || processingId === payment.id}
                          onClick={() => openRefund(payment)}
                          title="Solicitar estorno financeiro"
                          type="button"
                        >
                          <RotateCcw size={15} /> {processingId === payment.id ? "Processando" : "Estornar"}
                        </button>
                      ) : <span className="table-secondary">Somente consulta</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
