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
    { icon: CircleDollarSign, label: "Disponivel", value: money(data.summary.availableCents) },
    { icon: Clock3, label: "Pendente", value: money(data.summary.pendingCents) },
    { icon: LockKeyhole, label: "Bloqueado", value: money(data.summary.blockedCents) },
    { icon: ShieldCheck, label: "Tipos sacaveis", value: data.summary.withdrawableTypes },
  ];

  return (
    <div className="page-content">
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

      <section className="metric-grid" aria-label="Resumo financeiro das carteiras">
        {metrics.map(({ icon: Icon, label, value }) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__icon"><Icon size={20} /></span>
            <div><span>{label}</span><strong>{value}</strong><small>Base consolidada</small></div>
          </article>
        ))}
      </section>

      <section className="wallet-policy-grid">
        {data.wallets.map((wallet) => (
          <article className={`wallet-policy ${wallet.canWithdraw ? "wallet-policy--enabled" : ""}`} key={wallet.id}>
            <div className="wallet-policy__heading">
              <span className="wallet-policy__icon"><WalletCards size={20} /></span>
              <div><small>{wallet.code}</small><h2>{wallet.name}</h2></div>
              <span className={`status-dot ${wallet.canWithdraw ? "is-active" : "is-inactive"}`} />
            </div>
            <p>{wallet.description || "Saldo interno da plataforma."}</p>
            <dl className="wallet-policy__numbers">
              <div><dt>Disponivel</dt><dd>{money(wallet.availableCents)}</dd></div>
              <div><dt>Pendente</dt><dd>{money(wallet.pendingCents)}</dd></div>
              <div><dt>Bloqueado</dt><dd>{money(wallet.blockedCents)}</dd></div>
              <div><dt>Contas</dt><dd>{wallet.walletsCount.toLocaleString("pt-BR")}</dd></div>
            </dl>
            <label className="wallet-policy__switch">
              <input
                checked={wallet.canWithdraw}
                disabled={!canManageWallet || savingId === wallet.id}
                onChange={(event) => changeWithdrawPolicy(wallet, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{wallet.canWithdraw ? "Saque permitido" : "Saque bloqueado"}</strong>
                <small>A compra interna continua seguindo sua regra propria.</small>
              </span>
            </label>
          </article>
        ))}
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
