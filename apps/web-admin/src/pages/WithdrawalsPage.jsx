import { Check, RefreshCw, Search, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveAdminWithdrawal,
  getAdminWithdrawals,
  refreshAdminWithdrawal,
  rejectAdminWithdrawal,
} from "../services/admin.api";

const statusLabels = {
  APROVADO: "Aprovado",
  CANCELADO: "Cancelado",
  EM_ANALISE: "Em analise",
  EM_RECONCILIACAO: "Em reconciliacao",
  FALHOU: "Falhou",
  PAGO: "Pago",
  PROCESSANDO: "Processando",
  RECUSADO: "Recusado",
  SOLICITADO: "Solicitado",
};

function money(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" })
    .format(Number(cents) / 100);
}

function dateTime(value) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "-";
}

function statusTone(status) {
  if (status === "PAGO") return "success";
  if (["SOLICITADO", "EM_ANALISE", "APROVADO", "PROCESSANDO", "EM_RECONCILIACAO"].includes(status)) return "warning";
  return "danger";
}

export function WithdrawalsPage({ accessToken, canManageWithdrawals = false }) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [withdrawals, setWithdrawals] = useState([]);

  const load = useCallback(async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await getAdminWithdrawals(accessToken, status ? { status } : {});
      setWithdrawals(response.withdrawals ?? []);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar os saques.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, status]);

  useEffect(() => { load(); }, [load]);

  const visibleWithdrawals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return withdrawals;
    return withdrawals.filter((item) => [
      item.reference,
      item.user?.name,
      item.user?.email,
      item.wallet?.name,
    ].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term)));
  }, [search, withdrawals]);

  const summary = useMemo(() => ({
    amountCents: withdrawals.reduce((total, item) => total + (item.status === "PAGO" ? item.netAmountCents : 0), 0),
    paid: withdrawals.filter((item) => item.status === "PAGO").length,
    pending: withdrawals.filter((item) => ["SOLICITADO", "EM_ANALISE", "APROVADO"].includes(item.status)).length,
    processing: withdrawals.filter((item) => ["PROCESSANDO", "EM_RECONCILIACAO"].includes(item.status)).length,
  }), [withdrawals]);

  async function run(id, work, message) {
    setProcessingId(id);
    setError("");
    try {
      await work();
      await load();
    } catch (requestError) {
      setError(requestError.message ?? message);
    } finally {
      setProcessingId(null);
    }
  }

  function reject(item) {
    const reason = window.prompt("Informe o motivo da recusa (minimo de 8 caracteres):");
    if (!reason?.trim()) return;
    run(item.id, () => rejectAdminWithdrawal(accessToken, item.id, reason.trim()), "Nao foi possivel recusar o saque.");
  }

  return (
    <div className="page-content withdrawals-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">TESOURARIA</p>
          <h1>Saques Pix</h1>
          <p>Analise as reservas, envie o valor liquido e acompanhe a confirmacao do Asaas.</p>
        </div>
        <button className="button button--secondary" disabled={isLoading} onClick={load} type="button">
          <RefreshCw className={isLoading ? "spin" : ""} size={16} /> Atualizar
        </button>
      </header>

      <section className="withdrawal-metrics">
        <Metric label="Aguardando analise" tone="amber" value={summary.pending} />
        <Metric label="Em processamento" tone="blue" value={summary.processing} />
        <Metric label="Pagos" tone="mint" value={summary.paid} />
        <Metric label="Liquido enviado" tone="plain" value={money(summary.amountCents)} />
      </section>

      <div className="payments-toolbar">
        <label className="payments-search">
          <Search size={17} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Referencia, usuario ou carteira" value={search} />
        </label>
        <select onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <section className="data-section data-section--flush">
        {isLoading ? <div className="page-state">Carregando saques...</div> : visibleWithdrawals.length === 0 ? (
          <div className="empty-state"><WalletCards size={30} /><p>Nenhum saque encontrado.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="withdrawals-table">
              <thead><tr><th>Saque</th><th>Usuario</th><th>Carteira</th><th>Valores</th><th>Destino</th><th>Status</th><th>Acao</th></tr></thead>
              <tbody>{visibleWithdrawals.map((item) => (
                <tr key={item.id}>
                  <td><span className="table-primary">{item.reference}</span><span className="table-secondary">{dateTime(item.createdAt)}</span></td>
                  <td><span className="table-primary">{item.user?.name}</span><span className="table-secondary">{item.user?.email}</span></td>
                  <td><span className="table-primary">{item.wallet?.name}</span><span className="table-secondary">Saldo reservado</span></td>
                  <td><span className="table-primary">Liquido {money(item.netAmountCents)}</span><span className="table-secondary">Bruto {money(item.grossAmountCents)} - taxa {money(item.feeCents)}</span></td>
                  <td><span className="table-primary">{item.pixAccount?.keyMasked}</span><span className="table-secondary">{item.pixAccount?.keyType} - {item.pixAccount?.holderName}</span></td>
                  <td><span className={`status-badge status-badge--${statusTone(item.status)}`}>{statusLabels[item.status] ?? item.status}</span>{item.failureReason ? <span className="table-secondary">{item.failureReason}</span> : null}</td>
                  <td><div className="table-actions">
                    {canManageWithdrawals && ["SOLICITADO", "EM_ANALISE"].includes(item.status) ? <>
                      <button className="button button--primary" disabled={processingId === item.id} onClick={() => run(item.id, () => approveAdminWithdrawal(accessToken, item.id), "Nao foi possivel aprovar.")} type="button"><Check size={15} /> Aprovar</button>
                      <button className="button button--secondary" disabled={processingId === item.id} onClick={() => reject(item)} type="button"><X size={15} /> Recusar</button>
                    </> : null}
                    {canManageWithdrawals && item.status === "APROVADO" ? <button className="button button--secondary" disabled={processingId === item.id} onClick={() => reject(item)} type="button"><X size={15} /> Recusar</button> : null}
                    {canManageWithdrawals && ["PROCESSANDO", "EM_RECONCILIACAO"].includes(item.status) ? <button className="button button--secondary" disabled={processingId === item.id} onClick={() => run(item.id, () => refreshAdminWithdrawal(accessToken, item.id), "Nao foi possivel reconciliar.")} type="button"><RefreshCw size={15} /> Consultar</button> : null}
                    {!canManageWithdrawals ? <span className="table-secondary">Somente consulta</span> : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, tone, value }) {
  return <article className={`withdrawal-metric withdrawal-metric--${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}
