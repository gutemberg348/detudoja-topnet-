import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Tags,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAdminDashboard } from "../services/admin.api";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function DashboardPage({ accessToken, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      setData(await getAdminDashboard(accessToken));
    } catch (requestError) {
      setError(requestError.message || "Não foi possível carregar o painel.");
    }
  }, [accessToken]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!data && !error) {
    return <PageLoading label="Carregando visão geral" />;
  }

  if (!data) {
    return <PageError message={error} onRetry={loadDashboard} />;
  }

  const metrics = [
    {
      icon: UsersRound,
      label: "Participantes",
      meta: `${data.participants.active} ativos`,
      progress: data.participants.total ? (data.participants.active / data.participants.total) * 100 : 0,
      tone: "green",
      value: data.participants.total,
    },
    {
      icon: UserRoundCheck,
      label: "KYC aprovado",
      meta: `${data.kyc.pending} aguardando análise`,
      progress: data.kyc.approved + data.kyc.pending
        ? (data.kyc.approved / (data.kyc.approved + data.kyc.pending)) * 100
        : 0,
      tone: "blue",
      value: data.kyc.approved,
    },
    {
      icon: Clock3,
      label: "Cadastros pendentes",
      meta: `${data.participants.blocked} bloqueados`,
      progress: data.participants.total ? (data.participants.pending / data.participants.total) * 100 : 0,
      tone: "amber",
      value: data.participants.pending,
    },
    {
      icon: Tags,
      label: "Categorias",
      meta: `${data.categories.active} ativas no catálogo`,
      progress: data.categories.total ? (data.categories.active / data.categories.total) * 100 : 0,
      tone: "violet",
      value: data.categories.total,
    },
  ];

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Resumo operacional</p>
          <h1>Visão geral</h1>
          <p>Indicadores essenciais para acompanhar a plataforma e agir rápido.</p>
        </div>
        <button className="button button--primary" onClick={() => onNavigate("participants")} type="button">
          <UsersRound size={17} /> Gerenciar participantes
        </button>
      </header>

      <section className="metric-grid" aria-label="Indicadores principais">
        {metrics.map(({ icon: Icon, label, meta, progress, tone, value }) => (
          <article className={`metric-card metric-card--${tone}`} key={label}>
            <span className="metric-card__icon"><Icon size={20} /></span>
            <div className="metric-card__body">
              <span>{label}</span>
              <strong>{value.toLocaleString("pt-BR")}</strong>
              <div className="metric-card__footer">
                <span className="metric-card__track"><i style={{ width: `${Math.min(progress, 100)}%` }} /></span>
                <small>{meta}</small>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="data-section">
        <div className="section-heading">
          <div>
            <h2>Cadastros recentes</h2>
            <p>Últimos participantes que entraram na plataforma.</p>
          </div>
          <button className="button button--secondary" onClick={() => onNavigate("participants")} type="button">
            Ver todos <ArrowRight size={16} />
          </button>
        </div>

        {data.recentParticipants.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Participante</th><th>Status</th><th>KYC</th><th>Cadastro</th></tr></thead>
              <tbody>
                {data.recentParticipants.map((user) => (
                  <tr key={user.id}>
                    <td><UserIdentity user={user} /></td>
                    <td><StatusBadge status={user.status} /></td>
                    <td><StatusBadge status={user.kycStatus} /></td>
                    <td>{dateFormatter.format(new Date(user.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><CheckCircle2 size={24} /><p>Nenhum participante cadastrado ainda.</p></div>
        )}
      </section>
    </div>
  );
}

function UserIdentity({ user }) {
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="user-identity">
      <span className="avatar">{initials}</span>
      <div><strong>{user.name}</strong><small>{user.email}</small></div>
    </div>
  );
}
