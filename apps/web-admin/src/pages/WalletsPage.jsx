import {
  ArrowRight,
  Ban,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageError, PageLoading } from "../components/PageState";
import { getAdminWallets, updateAdminWalletType } from "../services/admin.api";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

function money(value) {
  return moneyFormatter.format(Number(value ?? 0) / 100);
}

export function WalletsPage({ accessToken, canManageWallet = false, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  const loadWallets = useCallback(async () => {
    setError("");
    try {
      setData(await getAdminWallets(accessToken));
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar as carteiras.");
    }
  }, [accessToken]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  async function changeWithdrawPolicy(wallet, canWithdraw) {
    setSavingId(wallet.id);
    setError("");
    try {
      setData(await updateAdminWalletType(accessToken, wallet.id, canWithdraw));
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel alterar a politica de saque.");
    } finally {
      setSavingId(null);
    }
  }

  if (!data && !error) return <PageLoading label="Carregando carteiras" />;
  if (!data) return <PageError message={error} onRetry={loadWallets} />;

  const metrics = [
    { icon: CircleDollarSign, label: "Disponivel", meta: "Saldo liberado para uso", tone: "green", value: money(data.summary.availableCents) },
    { icon: Clock3, label: "Pendente", meta: "Aguardando liberacao", tone: "amber", value: money(data.summary.pendingCents) },
    { icon: LockKeyhole, label: "Bloqueado", meta: "Saldo temporariamente retido", tone: "red", value: money(data.summary.blockedCents) },
    { icon: ShieldCheck, label: "Tipos sacaveis", meta: "Carteiras com saque habilitado", tone: "blue", value: data.summary.withdrawableTypes },
  ];

  return (
    <div className="page-content wallet-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Controle financeiro</p>
          <h1>Carteiras</h1>
          <p>Defina quais saldos podem sair da plataforma e acompanhe o dinheiro por origem.</p>
        </div>
        <button className="button button--secondary" onClick={loadWallets} type="button">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="metric-grid wallet-metrics" aria-label="Resumo financeiro das carteiras">
        {metrics.map(({ icon: Icon, label, meta, tone, value }) => (
          <article className={`metric-card wallet-metric wallet-metric--${tone}`} key={label}>
            <span className="metric-card__icon"><Icon size={20} /></span>
            <div className="metric-card__body">
              <span>{label}</span>
              <strong>{value}</strong>
              <div className="metric-card__footer"><small>{meta}</small></div>
            </div>
          </article>
        ))}
      </section>

      <section className="wallet-policy-section">
        <div className="wallet-section-heading">
          <div>
            <span>REGRAS DE MOVIMENTACAO</span>
            <h2>Politicas por carteira</h2>
            <p>Confira os saldos e controle quais origens podem solicitar retirada.</p>
          </div>
          <span className="wallet-section-count">{data.wallets.length} tipos</span>
        </div>

        <div className="wallet-policy-grid">
          {data.wallets.map((wallet) => (
            <article className={`wallet-policy ${wallet.canWithdraw ? "wallet-policy--enabled" : ""}`} key={wallet.id}>
              <div className="wallet-policy__heading">
                <span className="wallet-policy__icon"><WalletCards size={20} /></span>
                <div><small>{wallet.code}</small><h2>{wallet.name}</h2></div>
                <span className={`wallet-policy__status ${wallet.canWithdraw ? "is-active" : "is-inactive"}`}>
                  <i />{wallet.canWithdraw ? "Sacavel" : "Interna"}
                </span>
              </div>
              <p>{wallet.description || "Saldo interno da plataforma."}</p>
              <dl className="wallet-policy__numbers">
                <div><dt>Disponivel</dt><dd>{money(wallet.availableCents)}</dd></div>
                <div><dt>Pendente</dt><dd>{money(wallet.pendingCents)}</dd></div>
                <div><dt>Bloqueado</dt><dd>{money(wallet.blockedCents)}</dd></div>
                <div><dt>Contas</dt><dd>{wallet.walletsCount.toLocaleString("pt-BR")}</dd></div>
              </dl>
              <label className={`wallet-policy__switch ${wallet.canWithdraw ? "wallet-policy__switch--enabled" : ""}`}>
                <input
                  checked={wallet.canWithdraw}
                  disabled={!canManageWallet || savingId === wallet.id}
                  onChange={(event) => changeWithdrawPolicy(wallet, event.target.checked)}
                  type="checkbox"
                />
                <span className="wallet-policy__toggle" aria-hidden="true"><i /></span>
                <span className="wallet-policy__switch-copy">
                  <strong>{savingId === wallet.id ? "Salvando alteracao..." : wallet.canWithdraw ? "Saque permitido" : "Saque bloqueado"}</strong>
                  <small>{canManageWallet ? "Clique para alterar a politica desta carteira." : "Somente administradores autorizados podem alterar."}</small>
                </span>
              </label>
            </article>
          ))}
        </div>
      </section>

      <section className="wallet-admin-guide">
        <span><Ban size={20} /></span>
        <div>
          <h2>Ajustes de saldo ficam no participante</h2>
          <p>Credito e debito manual exigem motivo e geram lancamento com saldo anterior, saldo posterior e ID do administrador.</p>
        </div>
        <button className="button button--primary" onClick={() => onNavigate?.("participants")} type="button">
          Abrir participantes <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
