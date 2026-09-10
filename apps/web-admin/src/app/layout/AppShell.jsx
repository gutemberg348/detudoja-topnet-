import {
  BriefcaseBusiness,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  Truck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { Brand } from "../../components/Brand";
import { CategoriesPage } from "../../pages/CategoriesPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { KycPage } from "../../pages/KycPage";
import { NetworkPage } from "../../pages/NetworkPage";
import { PaymentsPage } from "../../pages/PaymentsPage";
import { ParticipantsPage } from "../../pages/ParticipantsPage";
import { SegmentsPage } from "../../pages/SegmentsPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { StoresPage } from "../../pages/StoresPage";
import { ServiceTypesPage } from "../../pages/ServiceTypesPage";
import { WithdrawalsPage } from "../../pages/WithdrawalsPage";
import { WalletsPage } from "../../pages/WalletsPage";
import {
  canAccessAdminPage,
  canManageEarnings,
  canManageParticipantData,
  canManageProviderProfiles,
  canManageParticipantStatus,
  canManageWallet,
  canManageNetwork,
  canRefundPayments,
  canManageSupport,
  canManageWithdrawals,
} from "../../utils/admin-permissions";

const pages = {
  categories: { component: CategoriesPage, context: "Comercial", icon: Tags, label: "Categorias" },
  payments: { component: PaymentsPage, context: "Financeiro", icon: ReceiptText, label: "Pagamentos" },
  dashboard: { component: DashboardPage, context: "Operação", icon: LayoutDashboard, label: "Visão geral" },
  kyc: { component: KycPage, context: "Compliance", icon: ShieldCheck, label: "KYC" },
  network: { component: NetworkPage, context: "Operação", icon: GitBranch, label: "Rede" },
  participants: { component: ParticipantsPage, context: "Operação", icon: UsersRound, label: "Participantes" },
  segments: { component: SegmentsPage, context: "Comercial", icon: BriefcaseBusiness, label: "Segmentos" },
  serviceTypes: { component: ServiceTypesPage, context: "Comercial", icon: Truck, label: "Serviços" },
  settings: { component: SettingsPage, context: "Sistema", icon: Settings, label: "Configurações" },
  stores: { component: StoresPage, context: "Comercial", icon: Store, label: "Lojas" },
  withdrawals: { component: WithdrawalsPage, context: "Financeiro", icon: WalletCards, label: "Saques" },
  wallets: { component: WalletsPage, context: "Financeiro", icon: WalletCards, label: "Carteiras" },
};

const navigationGroups = [
  {
    label: "Operação",
    items: [
      { icon: LayoutDashboard, id: "dashboard", label: "Visão geral" },
      { icon: UsersRound, id: "participants", label: "Participantes" },
      { icon: ShieldCheck, id: "kyc", label: "KYC" },
      { icon: GitBranch, id: "network", label: "Rede" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { icon: Store, id: "stores", label: "Lojas" },
      { icon: Tags, id: "categories", label: "Categorias" },
      { icon: BriefcaseBusiness, id: "segments", label: "Segmentos" },
      { icon: Truck, id: "serviceTypes", label: "Serviços" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { icon: ReceiptText, id: "payments", label: "Pagamentos" },
      { icon: WalletCards, id: "wallets", label: "Carteiras" },
      { icon: WalletCards, id: "withdrawals", label: "Saques" },
    ],
  },
  {
    label: "Sistema",
    items: [{ icon: Settings, id: "settings", label: "Configurações" }],
  },
];

export function AppShell({ onLogout, session }) {
  const initialPage = canAccessAdminPage(session.user.role, "dashboard")
    ? "dashboard"
    : "payments";
  const [activePage, setActivePage] = useState(initialPage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const availableGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessAdminPage(session.user.role, item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const activePageConfig = pages[activePage];
  const ActivePage = activePageConfig.component;
  const ActiveIcon = activePageConfig.icon;

  function navigate(page) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  return (
    <div className="admin-layout">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div>
            <Brand />
            <span className="sidebar__product">Painel administrativo</span>
          </div>
          <button
            className="icon-button sidebar__close"
            onClick={() => setMobileMenuOpen(false)}
            title="Fechar menu"
            type="button"
          >
            <X size={20} />
          </button>
        </div>
          <nav aria-label="Navegação administrativa">
          {availableGroups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <span className="sidebar__group-label">{group.label}</span>
              {group.items.map(({ icon: Icon, id, label }) => (
                <button
                  className={activePage === id ? "active" : ""}
                  key={id}
                  onClick={() => navigate(id)}
                  type="button"
                >
                  <Icon size={18} strokeWidth={activePage === id ? 2.3 : 1.9} />
                  <span>{label}</span>
                  {activePage === id ? <i aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__account">
          <span className="avatar avatar--admin">
            {session.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.user.name}</strong>
            <small>{session.user.role} · acesso autorizado</small>
          </div>
          <button className="icon-button" onClick={onLogout} title="Sair" type="button">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          aria-label="Fechar menu"
          className="sidebar-overlay"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      ) : null}

      <div className="admin-main">
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            onClick={() => setMobileMenuOpen(true)}
            title="Abrir menu"
            type="button"
          >
            <Menu size={21} />
          </button>
          <div className="topbar__page">
            <span className="topbar__page-icon"><ActiveIcon size={18} /></span>
            <div>
              <span>{activePageConfig.context} / Brasil Cashback Admin</span>
              <strong>{activePageConfig.label}</strong>
            </div>
          </div>
          <div className="topbar__status">
            <span><ShieldCheck size={16} /></span>
            <div><strong>Ambiente seguro</strong><small>Sessão administrativa ativa</small></div>
          </div>
        </header>
        <main>
      <ActivePage
            accessToken={session.accessToken}
            canManageWallet={canManageWallet(session.user.role)}
            canManageNetwork={canManageNetwork(session.user.role)}
            canRefundPayments={canRefundPayments(session.user.role)}
            canManageEarnings={canManageEarnings(session.user.role)}
            canManageParticipantData={canManageParticipantData(session.user.role)}
            canManageProviderProfiles={canManageProviderProfiles(session.user.role)}
            canManageParticipantStatus={canManageParticipantStatus(session.user.role)}
            canManageSupport={canManageSupport(session.user.role)}
            canManageWithdrawals={canManageWithdrawals(session.user.role)}
            onNavigate={navigate}
          />
        </main>
      </div>
    </div>
  );
}
