import { BriefcaseBusiness, Check, ChevronLeft, ChevronRight, KeyRound, Minus, Pencil, Plus, Search, ShieldCheck, UserRound, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  activateAllAdminUserServices,
  approveAdminKyc,
  approveAdminUserKycWithoutDocuments,
  getAdminUser,
  getAdminUsers,
  getAdminServiceTypes,
  addAdminUserService,
  adjustAdminUserWallet,
  rejectAdminKyc,
  revokeAdminKyc,
  updateAdminPayoutAccount,
  updateAdminCourierProfile,
  updateAdminSellerProfile,
  updateAdminUser,
  updateAdminUserPassword,
  updateAdminUserService,
  updateAdminUserStatus,
} from "../services/admin.api";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export function ParticipantsPage({
  accessToken,
  canManageKyc = false,
  canManageParticipantData = false,
  canManageParticipantPassword = false,
  canManagePayoutAccount = false,
  canManageProviderProfiles = false,
  canManageParticipantStatus = false,
  canManageWallet = false,
}) {
  const [filters, setFilters] = useState({ kycStatus: "", page: 1, search: "", status: "" });
  const [draftSearch, setDraftSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState({ cpf: "", email: "", name: "", phone: "" });
  const [creditForm, setCreditForm] = useState({ description: "Ajuste manual autorizado pelo administrador", operation: "CREDIT", value: "", walletCode: "saldo_pix" });
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedServiceType, setSelectedServiceType] = useState("");
  const [kycReason, setKycReason] = useState("");
  const [payoutReason, setPayoutReason] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("ATIVA");
  const [passwordForm, setPasswordForm] = useState({ password: "", reason: "" });

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
      setCreditForm({ description: "Ajuste manual autorizado pelo administrador", operation: "CREDIT", value: "", walletCode: "saldo_pix" });
      setSelectedServiceType("");
      setKycReason("");
      setPayoutReason("");
      setPayoutStatus(response.user.payoutAccount?.status ?? "ATIVA");
      setPasswordForm({ password: "", reason: "" });
      if (canManageProviderProfiles) {
        const services = await getAdminServiceTypes(accessToken);
        setServiceTypes(services.serviceTypes?.filter((service) => service.status === "ATIVO") ?? []);
      }
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

  async function adjustWallet(event) {
    event.preventDefault();
    if (!selectedUser) return;

    const normalizedValue = creditForm.value.replace(/\./g, "").replace(",", ".");
    const valueCents = Math.round(Number(normalizedValue) * 100);
    if (!Number.isSafeInteger(valueCents) || valueCents <= 0) {
      setError("Informe um valor de ajuste valido.");
      return;
    }

    setDetailLoading(true);
    try {
      const response = await adjustAdminUserWallet(accessToken, selectedUser.id, {
        description: creditForm.description,
        operation: creditForm.operation,
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

  async function updateProvider(work) {
    if (!selectedUser) return;
    setDetailLoading(true);
    setError("");
    try {
      const response = await work();
      setSelectedUser(response.user);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel atualizar o perfil comercial.");
    } finally {
      setDetailLoading(false);
    }
  }

  function changeSellerStatus(status) {
    return updateProvider(() => updateAdminSellerProfile(accessToken, selectedUser.id, { status }));
  }

  function changeCourier(data) {
    return updateProvider(() => updateAdminCourierProfile(accessToken, selectedUser.id, data));
  }

  function changeServiceStatus(sellerServiceId, status) {
    return updateProvider(() => updateAdminUserService(accessToken, selectedUser.id, sellerServiceId, status));
  }

  function addService() {
    if (!selectedServiceType) {
      setError("Selecione um servico para liberar.");
      return;
    }
    return updateProvider(async () => {
      const response = await addAdminUserService(accessToken, selectedUser.id, Number(selectedServiceType));
      setSelectedServiceType("");
      return response;
    });
  }

  async function refreshParticipant() {
    const response = await getAdminUser(accessToken, selectedUser.id);
    setSelectedUser(response.user);
    setPayoutStatus(response.user.payoutAccount?.status ?? "ATIVA");
    await loadUsers();
  }

  async function decideKyc(action) {
    if (!selectedUser?.kycSubmission) {
      setError("O participante ainda nao enviou os documentos KYC.");
      return;
    }
    if (kycReason.trim().length < 8) {
      setError("Explique a decisao KYC com pelo menos 8 caracteres.");
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const work = action === "approve"
        ? approveAdminKyc
        : action === "revoke"
          ? revokeAdminKyc
          : rejectAdminKyc;
      await work(accessToken, selectedUser.kycSubmission.id, kycReason.trim());
      setKycReason("");
      await refreshParticipant();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel alterar o KYC.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function approveKycWithoutDocuments() {
    if (!selectedUser) return;
    if (kycReason.trim().length < 8) {
      setError("Explique a liberacao KYC com pelo menos 8 caracteres.");
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const response = await approveAdminUserKycWithoutDocuments(
        accessToken,
        selectedUser.id,
        kycReason.trim(),
      );
      setSelectedUser(response.user);
      setKycReason("");
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel liberar o KYC sem documentos.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function resetParticipantPassword(event) {
    event.preventDefault();
    if (!selectedUser) return;
    setDetailLoading(true);
    setError("");
    try {
      await updateAdminUserPassword(accessToken, selectedUser.id, passwordForm);
      setPasswordForm({ password: "", reason: "" });
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel redefinir a senha.");
    } finally {
      setDetailLoading(false);
    }
  }

  function activateAllServices() {
    if (!selectedUser) return;
    return updateProvider(() => activateAllAdminUserServices(accessToken, selectedUser.id));
  }

  async function savePayoutStatus() {
    if (!selectedUser?.payoutAccount) return;
    if (payoutReason.trim().length < 8) {
      setError("Explique a alteracao da chave Pix com pelo menos 8 caracteres.");
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const response = await updateAdminPayoutAccount(accessToken, selectedUser.id, {
        reason: payoutReason.trim(),
        status: payoutStatus,
      });
      setSelectedUser(response.user);
      setPayoutReason("");
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel alterar a chave Pix.");
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
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            <dl className="detail-list">
              <div><dt>E-mail</dt><dd>{selectedUser.email}</dd></div><div><dt>Telefone</dt><dd>{selectedUser.phone || "Não informado"}</dd></div>
              <div><dt>CPF</dt><dd>{selectedUser.cpf || "Não informado"}</dd></div><div><dt>Tipo de conta</dt><dd>{selectedUser.accountType}</dd></div>
              <div><dt>Nível KYC</dt><dd>{selectedUser.kycLevel}</dd></div><div><dt>Saldo total</dt><dd>{moneyFormatter.format(selectedUser.balanceCents / 100)}</dd></div>
              <div><dt>Cadastrado em</dt><dd>{dateFormatter.format(new Date(selectedUser.createdAt))}</dd></div><div><dt>Último acesso</dt><dd>{selectedUser.lastLoginAt ? dateFormatter.format(new Date(selectedUser.lastLoginAt)) : "Nunca acessou"}</dd></div>
            </dl>
            {canManageParticipantData ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Cadastro</p><h3>Editar participante</h3></div><Pencil size={17} /></div>
              <div className="admin-edit-grid">
                <label>Nome<input onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} value={editForm.name} /></label>
                <label>E-mail<input onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} type="email" value={editForm.email} /></label>
                <label>Telefone<input onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} value={editForm.phone} /></label>
                <label>CPF<input onChange={(event) => setEditForm((current) => ({ ...current, cpf: event.target.value }))} value={editForm.cpf} /></label>
              </div>
              <button className="button button--secondary" disabled={detailLoading} onClick={saveUser} type="button"><Pencil size={16} /> Salvar dados</button>
            </section> : null}
            {canManageParticipantPassword ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Seguranca</p><h3>Redefinir senha do participante</h3></div><ShieldCheck size={17} /></div>
              <form className="admin-edit-grid" onSubmit={resetParticipantPassword}>
                <label className="admin-edit-grid__wide">Nova senha<input autoComplete="new-password" minLength={8} onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))} required type="password" value={passwordForm.password} /><small>Minimo de 8 caracteres, com letra e numero.</small></label>
                <label className="admin-edit-grid__wide">Motivo<input maxLength={500} minLength={8} onChange={(event) => setPasswordForm((current) => ({ ...current, reason: event.target.value }))} required value={passwordForm.reason} /></label>
                <button className="button button--secondary admin-edit-grid__wide" disabled={detailLoading} type="submit"><ShieldCheck size={16} /> Redefinir senha e encerrar sessoes</button>
              </form>
            </section> : null}
            {canManageKyc ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Compliance</p><h3>Controle manual do KYC</h3></div><ShieldCheck size={17} /></div>
              {selectedUser.kycSubmission ? <>
                <div className="detail-status"><StatusBadge status={selectedUser.kycSubmission.status} /><span>Envio #{selectedUser.kycSubmission.id}</span></div>
                <label className="admin-edit-grid__wide">Motivo da decisao<textarea maxLength={1000} onChange={(event) => setKycReason(event.target.value)} placeholder="Descreva o que foi conferido ou o motivo do bloqueio" rows={3} value={kycReason} /></label>
                <div className="modal__actions">
                  {selectedUser.kycSubmission.status === "EM_ANALISE" ? <button className="button button--danger" disabled={detailLoading} onClick={() => decideKyc("reject")} type="button"><X size={16} /> Reprovar</button> : null}
                  {["EM_ANALISE", "REPROVADO"].includes(selectedUser.kycSubmission.status) ? <button className="button button--primary" disabled={detailLoading} onClick={() => decideKyc("approve")} type="button"><Check size={16} /> {selectedUser.kycSubmission.status === "REPROVADO" ? "Reverter e aprovar" : "Aprovar e liberar Tier 2"}</button> : null}
                  {selectedUser.kycSubmission.status === "APROVADO" ? <button className="button button--danger" disabled={detailLoading} onClick={() => decideKyc("revoke")} type="button"><X size={16} /> Revogar e bloquear</button> : null}
                </div>
              </> : <>
                <div className="kyc-decision"><strong>Sem envio de documentos</strong><p>Esta sera uma aprovacao administrativa excepcional, sem fotos para conferencia.</p></div>
                <div className="detail-status"><StatusBadge status={selectedUser.kycStatus} /><span>{selectedUser.kycLevel}</span></div>
                {selectedUser.kycStatus !== "APROVADO" ? <>
                  <label className="admin-edit-grid__wide">Motivo da excecao<textarea maxLength={1000} onChange={(event) => setKycReason(event.target.value)} placeholder="Explique por que o KYC sera liberado sem documentos" rows={3} value={kycReason} /></label>
                  <button className="button button--primary" disabled={detailLoading} onClick={approveKycWithoutDocuments} type="button"><Check size={16} /> Aprovar sem documentos e liberar Tier 2</button>
                </> : null}
              </>}
            </section> : null}
            {canManagePayoutAccount ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Recebimento</p><h3>Chave Pix do participante</h3></div><KeyRound size={17} /></div>
              {selectedUser.payoutAccount ? <>
                <dl className="detail-list">
                  <div><dt>Chave</dt><dd>{selectedUser.payoutAccount.keyValue || selectedUser.payoutAccount.keyMasked}</dd></div>
                  <div><dt>Tipo</dt><dd>{selectedUser.payoutAccount.keyType}</dd></div>
                  <div><dt>Titular</dt><dd>{selectedUser.payoutAccount.holderName}</dd></div>
                  <div><dt>Status atual</dt><dd><StatusBadge status={selectedUser.payoutAccount.status} /></dd></div>
                </dl>
                <div className="admin-edit-grid">
                  <label>Status<select disabled={detailLoading} onChange={(event) => setPayoutStatus(event.target.value)} value={payoutStatus}><option value="ATIVA">Ativa / liberada</option><option value="INATIVA">Inativa</option><option value="BLOQUEADA">Bloqueada</option><option value="REPROVADA">Reprovada</option></select></label>
                  <label className="admin-edit-grid__wide">Motivo<input maxLength={500} onChange={(event) => setPayoutReason(event.target.value)} placeholder="Motivo da liberacao ou bloqueio" value={payoutReason} /></label>
                  <button className="button button--secondary admin-edit-grid__wide" disabled={detailLoading} onClick={savePayoutStatus} type="button"><Check size={16} /> Salvar situacao da chave</button>
                </div>
                <p className="table-secondary">A liberacao manual fica registrada com administrador, data e motivo. Ela nao substitui o KYC Tier 2 exigido para vender.</p>
              </> : <div className="kyc-decision"><strong>Nenhuma chave cadastrada</strong><p>O participante deve cadastrar a chave no aplicativo; depois ela podera ser liberada aqui.</p></div>}
            </section> : null}
            {canManageWallet ? <section className="admin-edit-panel admin-edit-panel--credit">
              <div className="admin-panel-heading"><div><p className="eyebrow">Financeiro auditado</p><h3>Ajustar saldo</h3></div><WalletCards size={17} /></div>
              <div className="wallet-operation" role="group" aria-label="Tipo de ajuste">
                <button className={creditForm.operation === "CREDIT" ? "active" : ""} onClick={() => setCreditForm((current) => ({ ...current, operation: "CREDIT" }))} type="button"><Plus size={15} /> Adicionar</button>
                <button className={creditForm.operation === "DEBIT" ? "active wallet-operation__debit" : "wallet-operation__debit"} onClick={() => setCreditForm((current) => ({ ...current, operation: "DEBIT" }))} type="button"><Minus size={15} /> Diminuir</button>
              </div>
              <form className="admin-edit-grid" onSubmit={adjustWallet}>
                <label>Carteira<select onChange={(event) => setCreditForm((current) => ({ ...current, walletCode: event.target.value }))} value={creditForm.walletCode}><option value="saldo_pix">Saldo Pix</option><option value="cashback">Cashback</option><option value="rede">Rede</option><option value="vendas">Vendas</option></select></label>
                <label>Valor<input inputMode="decimal" onChange={(event) => setCreditForm((current) => ({ ...current, value: event.target.value }))} placeholder="0,00" value={creditForm.value} /></label>
                <label className="admin-edit-grid__wide">Motivo<input onChange={(event) => setCreditForm((current) => ({ ...current, description: event.target.value }))} value={creditForm.description} /></label>
                <button className={`button admin-edit-grid__wide ${creditForm.operation === "DEBIT" ? "button--danger" : "button--primary"}`} disabled={detailLoading} type="submit">
                  {creditForm.operation === "DEBIT" ? <Minus size={16} /> : <Plus size={16} />}
                  {creditForm.operation === "DEBIT" ? "Debitar carteira" : "Creditar carteira"}
                </button>
              </form>
              <div className="admin-wallet-list">
                {(selectedUser.wallets ?? []).map((wallet) => <span key={wallet.code}><strong>{wallet.name}</strong>{moneyFormatter.format(wallet.availableCents / 100)}</span>)}
              </div>
            </section> : null}
            {canManageProviderProfiles ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Operacao comercial</p><h3>Prestador, motoboy e servicos</h3></div><BriefcaseBusiness size={17} /></div>
              <p className="table-secondary">KYC e decidido na fila de documentos. A liberacao aqui respeita conta ativa, KYC aprovado e regras de cada modalidade.</p>
              <button className="button button--primary" disabled={detailLoading || selectedUser.kycStatus !== "APROVADO" || selectedUser.status !== "ATIVO"} onClick={activateAllServices} type="button"><Check size={16} /> Ativar todos os servicos elegiveis</button>
              {selectedUser.providerProfile ? <>
                <div className="admin-edit-grid">
                  <label>Status do prestador<select disabled={detailLoading} onChange={(event) => changeSellerStatus(event.target.value)} value={selectedUser.providerProfile.status}><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="BLOQUEADO">Bloqueado</option><option value="REPROVADO">Reprovado</option></select></label>
                  <label>KYC comercial<input disabled value={selectedUser.providerProfile.kycStatus} /></label>
                </div>
                {selectedUser.providerProfile.courier ? <div className="admin-edit-grid">
                  <label>Status do motoboy<select disabled={detailLoading} onChange={(event) => changeCourier({ status: event.target.value })} value={selectedUser.providerProfile.courier.status}><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="BLOQUEADO">Bloqueado</option></select></label>
                  <label className="drawer-actions"><span>Recebe chamadas da plataforma</span><input checked={selectedUser.providerProfile.courier.acceptsPlatformCalls} disabled={detailLoading || selectedUser.providerProfile.courier.status !== "ATIVO"} onChange={(event) => changeCourier({ acceptsPlatformCalls: event.target.checked })} type="checkbox" /></label>
                </div> : <div className="kyc-decision"><strong>Sem cadastro de motoboy</strong><p>CNH, placa e veiculo continuam cadastrados pelo proprio prestador e validados pela plataforma.</p></div>}
              </> : <div className="kyc-decision"><strong>Sem perfil de prestador</strong><p>Liberar o primeiro servico cria o perfil apenas para conta ativa, CPF informado e KYC aprovado.</p></div>}
              <div className="admin-edit-grid">
                <label className="admin-edit-grid__wide">Adicionar servico<select disabled={detailLoading || !serviceTypes.length} onChange={(event) => setSelectedServiceType(event.target.value)} value={selectedServiceType}><option value="">Selecione no catalogo</option>{serviceTypes.map((service) => <option key={service.id} value={service.id}>{service.name}{service.operationalType === "ENTREGA_LOCAL" ? " - entrega local" : ""}</option>)}</select></label>
                <button className="button button--secondary admin-edit-grid__wide" disabled={detailLoading || !selectedServiceType} onClick={addService} type="button"><Plus size={16} /> Liberar servico</button>
              </div>
              {selectedUser.providerProfile?.services?.length ? <div className="admin-edit-grid">
                {selectedUser.providerProfile.services.map((service) => <label key={service.id}>{service.typeName}<select disabled={detailLoading} onChange={(event) => changeServiceStatus(service.id, event.target.value)} value={service.status}><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="INATIVO">Inativo</option></select><small>{service.operationalType === "ENTREGA_LOCAL" ? "Entrega local" : "Atendimento por servico"}{service.availableNow ? " - online agora" : " - offline"}</small></label>)}
              </div> : null}
              <div className="kyc-decision"><ShieldCheck size={16} /><div><strong>KYC do participante: {selectedUser.kycStatus}</strong><p>Aprovacao e reprovacao documental ficam em Compliance e sincronizam o prestador e motoboy automaticamente.</p></div></div>
            </section> : null}
            {canManageProviderProfiles && selectedUser.adminActions?.length ? <section className="admin-edit-panel">
              <div className="admin-panel-heading"><div><p className="eyebrow">Rastreabilidade</p><h3>Ultimas acoes administrativas</h3></div><ShieldCheck size={17} /></div>
              <div className="detail-list">{selectedUser.adminActions.map((action) => <div key={action.id}><dt>{action.action.replaceAll("_", " ")}</dt><dd>{action.adminName} - {dateFormatter.format(new Date(action.at))}</dd></div>)}</div>
            </section> : null}
            {canManageParticipantStatus ? <div className="drawer-actions"><label htmlFor="participant-status">Situação da conta</label><select disabled={detailLoading} id="participant-status" onChange={(event) => changeStatus(event.target.value)} value={selectedUser.status}><option value="ATIVO">Ativo</option><option value="PENDENTE">Pendente</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div> : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
