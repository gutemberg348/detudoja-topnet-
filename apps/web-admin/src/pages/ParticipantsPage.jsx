import { ChevronLeft, ChevronRight, Pencil, Plus, Search, UserRound, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getAdminUser,
  getAdminUsers,
  creditAdminUserWallet,
  updateAdminUser,
  updateAdminUserStatus,
} from "../services/admin.api";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export function ParticipantsPage({ accessToken }) {
  const [filters, setFilters] = useState({ kycStatus: "", page: 1, search: "", status: "" });
  const [draftSearch, setDraftSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState({ cpf: "", email: "", name: "", phone: "" });
  const [creditForm, setCreditForm] = useState({ description: "Credito manual do administrador", value: "", walletCode: "saldo_pix" });

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      setData(await getAdminUsers(accessToken, { ...filters, perPage: 12 }));
    } catch (requestError) {
      setError(requestError.message || "Não foi possível carregar os participantes.");
    }
  }, [accessToken, filters]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function applySearch(event) {
    event.preventDefault();
    setFilters((current) => ({ ...current, page: 1, search: draftSearch.trim() }));
  }

  async function openUser(userId) {
    setDetailLoading(true);
    setSelectedUser(null);
    try {
      const response = await getAdminUser(accessToken, userId);
      setSelectedUser(response.user);
      setEditForm({ cpf: response.user.cpfValue ?? "", email: response.user.email ?? "", name: response.user.name ?? "", phone: response.user.phone ?? "" });
      setCreditForm({ description: "Credito manual do administrador", value: "", walletCode: "saldo_pix" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(status) {
    if (!selectedUser) return;
    setDetailLoading(true);
    try {
      const response = await updateAdminUserStatus(accessToken, selectedUser.id, status);
      setSelectedUser(response.user);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveUser() {
    if (!selectedUser) return;
    setDetailLoading(true);
    try {
      const response = await updateAdminUser(accessToken, selectedUser.id, editForm);
      setSelectedUser(response.user);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function creditWallet(event) {
    event.preventDefault();
    if (!selectedUser) return;

    const normalizedValue = creditForm.value.replace(/\./g, "").replace(",", ".");
    const valueCents = Math.round(Number(normalizedValue) * 100);
    if (!Number.isSafeInteger(valueCents) || valueCents <= 0) {
      setError("Informe um valor de credito valido.");
      return;
    }

    setDetailLoading(true);
    try {
      const response = await creditAdminUserWallet(accessToken, selectedUser.id, {
        description: creditForm.description,
        valueCents,
        walletCode: creditForm.walletCode,
      });
      setSelectedUser(response.user);
      setCreditForm((current) => ({ ...current, value: "" }));
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-heading">
        <div><p className="eyebrow">Base de usuários</p><h1>Participantes</h1><p>Consulte cadastros, KYC, saldos e situação de acesso.</p></div>
      </header>

      <section className="toolbar" aria-label="Filtros dos participantes">
        <form className="search-field" onSubmit={applySearch}>
          <Search size={18} />
          <input onChange={(event) => setDraftSearch(event.target.value)} placeholder="Buscar por nome, e-mail, telefone ou CPF" value={draftSearch} />
          <button aria-label="Buscar" title="Buscar" type="submit"><Search size={18} /></button>
        </form>
        <select aria-label="Filtrar por status" onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: event.target.value }))} value={filters.status}>
          <option value="">Todos os status</option><option value="ATIVO">Ativos</option><option value="PENDENTE">Pendentes</option><option value="BLOQUEADO">Bloqueados</option><option value="INATIVO">Inativos</option>
        </select>
        <select aria-label="Filtrar por KYC" onChange={(event) => setFilters((current) => ({ ...current, kycStatus: event.target.value, page: 1 }))} value={filters.kycStatus}>
          <option value="">Todo KYC</option><option value="APROVADO">Aprovado</option><option value="PENDENTE">Pendente</option><option value="EM_ANALISE">Em análise</option><option value="REPROVADO">Reprovado</option>
        </select>
      </section>

      {data && error ? <div className="inline-error" role="alert">{error}</div> : null}
      {!data && !error ? <PageLoading label="Carregando participantes" /> : null}
      {!data && error ? <PageError message={error} onRetry={loadUsers} /> : null}
      {data ? (
        <section className="data-section data-section--flush">
          <div className="result-line"><strong>{data.pagination.total.toLocaleString("pt-BR")}</strong> participantes encontrados</div>
          <div className="table-scroll">
            <table className="participants-table">
              <thead><tr><th>Participante</th><th>Contato</th><th>Status</th><th>KYC</th><th>Saldo total</th><th></th></tr></thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td><div className="user-identity"><span className="avatar"><UserRound size={18} /></span><div><strong>{user.name}</strong><small>{user.accountType}</small></div></div></td>
                    <td><strong className="table-primary">{user.email}</strong><small className="table-secondary">{user.phone || "Sem telefone"}</small></td>
                    <td><StatusBadge status={user.status} /></td><td><StatusBadge status={user.kycStatus} /></td>
                    <td>{moneyFormatter.format(user.balanceCents / 100)}</td>
                    <td><button className="icon-button" onClick={() => openUser(user.id)} title="Ver cadastro" type="button"><ChevronRight size={18} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.users.length ? <div className="empty-state"><UserRound size={24} /><p>Nenhum cadastro corresponde aos filtros.</p></div> : null}
          <div className="pagination">
            <span>Página {data.pagination.page} de {data.pagination.pages}</span>
            <div>
              <button className="icon-button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} title="Página anterior" type="button"><ChevronLeft size={18} /></button>
              <button className="icon-button" disabled={filters.page >= data.pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} title="Próxima página" type="button"><ChevronRight size={18} /></button>
            </div>
          </div>
        </section>
      ) : null}

      {detailLoading && !selectedUser ? <div className="drawer-backdrop"><aside className="detail-drawer"><PageLoading label="Abrindo cadastro" /></aside></div> : null}
      {selectedUser ? (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedUser(null)}>
          <aside className="detail-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-header"><div><p className="eyebrow">Cadastro completo</p><h2>{selectedUser.name}</h2></div><button className="icon-button" onClick={() => setSelectedUser(null)} title="Fechar" type="button"><X size={19} /></button></div>
            <div className="detail-status"><StatusBadge status={selectedUser.status} /><StatusBadge status={selectedUser.kycStatus} /></div>
            <dl className="detail-list">
              <div><dt>E-mail</dt><dd>{selectedUser.email}</dd></div><div><dt>Telefone</dt><dd>{selectedUser.phone || "Não informado"}</dd></div>
              <div><dt>CPF</dt><dd>{selectedUser.cpf || "Não informado"}</dd></div><div><dt>Tipo de conta</dt><dd>{selectedUser.accountType}</dd></div>
              <div><dt>Nível KYC</dt><dd>{selectedUser.kycLevel}</dd></div><div><dt>Saldo total</dt><dd>{moneyFormatter.format(selectedUser.balanceCents / 100)}</dd></div>
              <div><dt>Cadastrado em</dt><dd>{dateFormatter.format(new Date(selectedUser.createdAt))}</dd></div><div><dt>Último acesso</dt><dd>{selectedUser.lastLoginAt ? dateFormatter.format(new Date(selectedUser.lastLoginAt)) : "Nunca acessou"}</dd></div>
            </dl>
            <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Cadastro</p><h3>Editar participante</h3></div><Pencil size={17} /></div>
              <div className="admin-edit-grid">
                <label>Nome<input onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} value={editForm.name} /></label>
                <label>E-mail<input onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} type="email" value={editForm.email} /></label>
                <label>Telefone<input onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} value={editForm.phone} /></label>
                <label>CPF<input onChange={(event) => setEditForm((current) => ({ ...current, cpf: event.target.value }))} value={editForm.cpf} /></label>
              </div>
              <button className="button button--secondary" disabled={detailLoading} onClick={saveUser} type="button"><Pencil size={16} /> Salvar dados</button>
            </section>
            <section className="admin-edit-panel admin-edit-panel--credit">
              <div className="admin-panel-heading"><div><p className="eyebrow">Financeiro</p><h3>Inserir saldo</h3></div><WalletCards size={17} /></div>
              <form className="admin-edit-grid" onSubmit={creditWallet}>
                <label>Carteira<select onChange={(event) => setCreditForm((current) => ({ ...current, walletCode: event.target.value }))} value={creditForm.walletCode}><option value="saldo_pix">Saldo Pix</option><option value="cashback">Cashback</option><option value="rede">Rede</option><option value="vendas">Vendas</option></select></label>
                <label>Valor<input inputMode="decimal" onChange={(event) => setCreditForm((current) => ({ ...current, value: event.target.value }))} placeholder="0,00" value={creditForm.value} /></label>
                <label className="admin-edit-grid__wide">Motivo<input onChange={(event) => setCreditForm((current) => ({ ...current, description: event.target.value }))} value={creditForm.description} /></label>
                <button className="button button--primary admin-edit-grid__wide" disabled={detailLoading} type="submit"><Plus size={16} /> Creditar carteira</button>
              </form>
              <div className="admin-wallet-list">
                {(selectedUser.wallets ?? []).map((wallet) => <span key={wallet.code}><strong>{wallet.name}</strong>{moneyFormatter.format(wallet.availableCents / 100)}</span>)}
              </div>
            </section>
            <div className="drawer-actions"><label htmlFor="participant-status">Situação da conta</label><select disabled={detailLoading} id="participant-status" onChange={(event) => changeStatus(event.target.value)} value={selectedUser.status}><option value="ATIVO">Ativo</option><option value="PENDENTE">Pendente</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
