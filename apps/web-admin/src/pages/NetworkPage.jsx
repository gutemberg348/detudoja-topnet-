import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, Ban, CheckCircle2, ChevronRight,
  CircleDollarSign, GitBranch, LockKeyhole, RefreshCw, Search, ShieldCheck,
  UserRound, UsersRound, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import {
  getAdminNetwork, moveAdminNetworkPlacement, updateAdminNetworkEarnings,
  updateAdminUserStatus,
} from "../services/admin.api";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function NetworkPage({ accessToken, canManageNetwork = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [maxDepth, setMaxDepth] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [focusId, setFocusId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveForm, setMoveForm] = useState({ parentUserId: "", position: "1", reason: "" });
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [operation, setOperation] = useState(null);
  const [operationReason, setOperationReason] = useState("");
  const [operationError, setOperationError] = useState("");
  const [operating, setOperating] = useState(false);

  const loadNetwork = useCallback(async () => {
    setError("");
    try {
      const response = await getAdminNetwork(accessToken, { maxDepth });
      setData(response);
      setFocusId((current) => current ?? response.root?.id ?? null);
      setSelectedId((current) => current ?? response.root?.id ?? null);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar a rede.");
    }
  }, [accessToken, maxDepth]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  const allPeople = useMemo(
    () => (data?.root ? [data.root, ...data.people] : data?.people ?? []),
    [data],
  );
  const peopleById = useMemo(
    () => new Map(allPeople.map((person) => [person.id, person])),
    [allPeople],
  );
  const selectedPerson = peopleById.get(selectedId) ?? data?.root ?? null;
  const focusPerson = peopleById.get(focusId) ?? data?.root ?? null;
  const branchLevels = useMemo(
    () => buildVisibleLevels(focusPerson, data?.people ?? [], 2),
    [data?.people, focusPerson],
  );
  const filteredPeople = useMemo(() => {
    const term = normalize(search);
    return (data?.people ?? []).filter((person) => {
      if (!matchesStatus(person, statusFilter)) return false;
      if (!term) return true;
      return [person.name, person.email, person.parentName, person.parentEmail,
        person.parentSide, person.parentConnectionType, person.directSponsorName,
        person.directSponsorEmail, person.branch, person.status, person.kycStatus]
        .filter(Boolean)
        .some((value) => normalize(value).includes(term));
    });
  }, [data?.people, search, statusFilter]);

  const destinationPeople = useMemo(() => {
    if (!data?.root || !moveTarget) return [];
    const blocked = collectDescendantIds(moveTarget.id, data.people);
    return [data.root, ...data.people].filter((person) => !blocked.has(person.id));
  }, [data, moveTarget]);

  function selectPerson(person, focus = false) {
    setSelectedId(person.id);
    if (focus) setFocusId(person.id);
  }

  function openMove(person) {
    setMoveError("");
    setMoveTarget(person);
    setMoveForm({
      parentUserId: person.parentId ? String(person.parentId) : "",
      position: String(person.position || 1),
      reason: "",
    });
  }

  function openOperation(kind, person) {
    setOperationError("");
    setOperationReason("");
    setOperation({ kind, person });
  }

  async function submitMove(event) {
    event.preventDefault();
    if (!moveTarget) return;
    setMoving(true);
    setMoveError("");
    try {
      const response = await moveAdminNetworkPlacement(accessToken, moveTarget.id, {
        parentUserId: Number(moveForm.parentUserId),
        position: Number(moveForm.position),
        reason: moveForm.reason,
      });
      setData(response);
      setSelectedId(moveTarget.id);
      setMoveTarget(null);
    } catch (requestError) {
      setMoveError(requestError.message || "Nao foi possivel reposicionar o participante.");
    } finally {
      setMoving(false);
    }
  }

  async function submitOperation(event) {
    event.preventDefault();
    if (!operation) return;
    setOperating(true);
    setOperationError("");
    try {
      if (operation.kind === "BLOCK_EARNINGS" || operation.kind === "RELEASE_EARNINGS") {
        const response = await updateAdminNetworkEarnings(accessToken, operation.person.id, {
          blocked: operation.kind === "BLOCK_EARNINGS",
          reason: operationReason,
        });
        setData(response);
      } else {
        await updateAdminUserStatus(
          accessToken,
          operation.person.id,
          operation.kind === "BLOCK_ACCOUNT" ? "BLOQUEADO" : "ATIVO",
        );
        await loadNetwork();
      }
      setSelectedId(operation.person.id);
      setOperation(null);
    } catch (requestError) {
      setOperationError(requestError.message || "Nao foi possivel concluir a operacao.");
    } finally {
      setOperating(false);
    }
  }

  if (!data && !error) return <PageLoading label="Carregando rede" />;
  if (!data) return <PageError message={error} onRetry={loadNetwork} />;

  const metrics = [
    { icon: UsersRound, label: "Na matriz", meta: `${data.summary.active} ativos`, value: data.summary.total },
    { icon: GitBranch, label: "Diretos da raiz", meta: "Patrocinados pela empresa", value: data.summary.directToRoot },
    { icon: ShieldCheck, label: "Qualificados", meta: `${data.summary.verified} com KYC aprovado`, value: data.summary.qualified },
    { icon: CircleDollarSign, label: "Ganhos bloqueados", meta: "Sem novas comissoes de rede", value: data.summary.earningsBlocked ?? 0, tone: "danger" },
  ];

  return (
    <div className="page-content network-admin-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Central da matriz global</p>
          <h1>Gestao completa da rede</h1>
          <p>Navegue por ramos, inspecione vinculos e controle conta, ganhos e posicao com rastreabilidade.</p>
        </div>
        <button className="button button--secondary" onClick={loadNetwork} type="button"><RefreshCw size={16} /> Atualizar dados</button>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="metric-grid" aria-label="Resumo da rede">
        {metrics.map(({ icon: Icon, label, meta, tone, value }) => (
          <article className={`metric-card network-metric ${tone ? `network-metric--${tone}` : ""}`} key={label}>
            <span className="metric-card__icon"><Icon size={20} /></span>
            <div className="metric-card__body"><span>{label}</span><strong>{Number(value).toLocaleString("pt-BR")}</strong><small>{meta}</small></div>
          </article>
        ))}
      </section>

      <section className="toolbar toolbar--network" aria-label="Filtros da rede">
        <form className="search-field" onSubmit={(event) => event.preventDefault()}><Search size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, patrocinador ou lado" value={search} /></form>
        <select aria-label="Filtrar situacao" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="TODOS">Todos os participantes</option><option value="ATIVOS">Contas ativas</option><option value="BLOQUEADOS">Contas bloqueadas</option><option value="QUALIFICADOS">Qualificados</option><option value="GANHOS_BLOQUEADOS">Ganhos bloqueados</option><option value="KYC_PENDENTE">KYC pendente</option>
        </select>
        <select aria-label="Profundidade consultada" onChange={(event) => setMaxDepth(Number(event.target.value))} value={maxDepth}>
          <option value={3}>Consultar 3 niveis</option><option value={5}>Consultar 5 niveis</option><option value={10}>Consultar 10 niveis</option><option value={20}>Consultar 20 niveis</option>
        </select>
      </section>

      {data.diagnostics.orphanUsers.length || data.diagnostics.unallocatedIndications.length ? (
        <section className="network-alerts" aria-label="Diagnostico da rede">
          {data.diagnostics.orphanUsers.length ? <DiagnosticCard count={data.diagnostics.orphanUsers.length} items={data.diagnostics.orphanUsers} title="Usuarios sem indicacao" /> : null}
          {data.diagnostics.unallocatedIndications.length ? <DiagnosticCard count={data.diagnostics.unallocatedIndications.length} items={data.diagnostics.unallocatedIndications.map((item) => ({ email: item.indicatedEmail, id: item.id, name: item.indicatedName, status: item.status }))} title="Indicacoes sem alocacao" /> : null}
        </section>
      ) : null}

      <section className="network-command-layout">
        <article className="data-section network-explorer">
          <div className="section-heading network-explorer__heading">
            <div><h2>Explorador lateral da matriz</h2><p>O participante em foco fica a esquerda; abra qualquer descendente para avancar mais dois niveis.</p></div>
            <div className="network-explorer__nav">
              <button className="button button--secondary" disabled={!focusPerson?.parentId} onClick={() => setFocusId(focusPerson?.parentId)} type="button"><ArrowLeft size={15} /> Subir</button>
              <button className="button button--secondary" disabled={focusId === data.root?.id} onClick={() => setFocusId(data.root?.id)} type="button">Ir para raiz</button>
            </div>
          </div>
          {focusPerson ? (
            <div className="network-lateral-scroll"><div className="network-lateral-map">
              <div className="network-generation network-generation--focus"><span className="network-generation__label">Em foco</span><NetworkPersonCard active person={focusPerson} onFocus={selectPerson} onSelect={selectPerson} /></div>
              {branchLevels.map((level, index) => (
                <div className="network-generation" key={`generation-${index + 1}`}><span className="network-generation__label">Nivel +{index + 1} <b>{level.length}</b></span><div className="network-generation__people">{level.length ? level.map((person) => <NetworkPersonCard key={person.id} person={person} selected={person.id === selectedId} onFocus={selectPerson} onSelect={selectPerson} />) : <div className="network-generation__empty">Nenhum participante neste nivel</div>}</div></div>
              ))}
            </div></div>
          ) : <div className="empty-state"><GitBranch size={24} /><p>Raiz da empresa ainda nao existe.</p></div>}
        </article>

        <MemberControlPanel canManage={canManageNetwork} isRoot={selectedPerson?.id === data.root?.id} onMove={openMove} onOperation={openOperation} person={selectedPerson} />
      </section>

      <section className="network-safety-note" aria-label="Politica de alteracoes"><LockKeyhole size={20} /><div><strong>Controles protegidos</strong><p>Mover nao troca o patrocinador. Bloquear ganhos impede apenas novas comissoes; saldo ja creditado permanece intacto. Todas as alteracoes de matriz e ganhos sao auditadas.</p></div></section>

      <section className="data-section data-section--flush network-directory">
        <div className="section-heading"><div><h2>Diretorio da rede</h2><p>Localize qualquer cadastro e abra seus controles administrativos.</p></div><span className="network-hint">{filteredPeople.length.toLocaleString("pt-BR")} encontrados</span></div>
        <div className="table-scroll"><table className="network-table">
          <thead><tr><th>Pessoa</th><th>Posicao</th><th>Alocada sob</th><th>Patrocinador</th><th>Conta</th><th>KYC</th><th>Ganhos</th><th>Entrada</th><th></th></tr></thead>
          <tbody>{filteredPeople.slice(0, 200).map((person) => (
            <tr className={person.id === selectedId ? "is-selected" : ""} key={person.id}>
              <td><UserIdentity person={person} /></td>
              <td><strong className="table-primary">Nivel {person.level} · {person.parentSide || "-"}</strong><small className="table-secondary">Perna {person.branch || "-"} · {formatConnection(person.parentConnectionType)}</small></td>
              <td><strong className="table-primary">{person.parentName || "-"}</strong><small className="table-secondary">{person.parentEmail || ""}</small></td>
              <td><strong className="table-primary">{person.directSponsorName || "-"}</strong><small className="table-secondary">{person.directSponsorEmail || ""}</small></td>
              <td><StatusBadge status={person.status} /></td><td><StatusBadge status={person.kycStatus} /></td><td>{person.networkEarningsBlocked ? <StatusBadge status="BLOQUEADO" /> : <StatusBadge status="ATIVO" />}</td><td>{dateFormatter.format(new Date(person.createdAt))}</td>
              <td><button className="button button--secondary" onClick={() => { selectPerson(person, true); window.scrollTo({ top: 0, behavior: "smooth" }); }} type="button"><ChevronRight size={15} /> Gerenciar</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        {filteredPeople.length > 200 ? <div className="result-line">Mostrando os primeiros 200 registros filtrados.</div> : null}
        {!filteredPeople.length ? <div className="empty-state"><UserRound size={24} /><p>Nenhuma pessoa encontrada com esses filtros.</p></div> : null}
      </section>

      {moveTarget ? (
        <div className="modal-backdrop" onMouseDown={() => !moving && setMoveTarget(null)}><section className="modal network-move-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal__header"><div><p className="eyebrow">Posicao matricial</p><h2>Mover {moveTarget.name}</h2></div><button className="icon-button" disabled={moving} onClick={() => setMoveTarget(null)} title="Fechar" type="button"><X size={18} /></button></div>
          <div className="network-move-warning"><LockKeyhole size={19} /><p>O patrocinador direto permanece <strong>{moveTarget.directSponsorName || "inalterado"}</strong>. A subarvore acompanha a pessoa movida.</p></div>
          {moveError ? <div className="inline-error" role="alert">{moveError}</div> : null}
          <form className="category-form" onSubmit={submitMove}>
            <label>Novo pai na matriz<select required onChange={(event) => setMoveForm((current) => ({ ...current, parentUserId: event.target.value }))} value={moveForm.parentUserId}><option value="">Selecione o destino</option>{destinationPeople.map((person) => <option key={person.id} value={person.id}>{person.name} - ID {person.id}{person.level === 0 ? " (raiz)" : ` - nivel ${person.level}`}</option>)}</select></label>
            <label>Lado<select onChange={(event) => setMoveForm((current) => ({ ...current, position: event.target.value }))} value={moveForm.position}><option value="1">Esquerda - posicao 1</option><option value="2">Direita - posicao 2</option></select></label>
            <label>Motivo da alteracao<textarea minLength={8} onChange={(event) => setMoveForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Ex.: correcao de alocacao autorizada" required rows={3} value={moveForm.reason} /></label>
            <div className="modal__actions"><button className="button button--secondary" disabled={moving} onClick={() => setMoveTarget(null)} type="button">Cancelar</button><button className="button button--primary" disabled={moving} type="submit"><ArrowLeftRight size={16} /> {moving ? "Movendo..." : "Confirmar mudanca"}</button></div>
          </form>
        </section></div>
      ) : null}

      {operation ? <OperationModal error={operationError} onCancel={() => !operating && setOperation(null)} onReasonChange={setOperationReason} onSubmit={submitOperation} operating={operating} operation={operation} reason={operationReason} /> : null}
    </div>
  );
}

function MemberControlPanel({ canManage, isRoot, onMove, onOperation, person }) {
  if (!person) return null;
  return (
    <aside className="network-member-panel">
      <div className="network-member-panel__hero"><span className="avatar">{initials(person.name)}</span><div><p className="eyebrow">Participante selecionado</p><h2>{person.name}</h2><span>{person.email}</span></div></div>
      <div className="network-member-panel__badges"><StatusBadge status={person.status} /><StatusBadge status={person.kycStatus} />{person.networkEarningsBlocked ? <span className="network-pill network-pill--danger">Ganhos bloqueados</span> : <span className="network-pill">Ganhos liberados</span>}</div>
      <dl className="network-member-details">
        <div><dt>Posicao</dt><dd>{person.level === 0 ? "Raiz operacional" : `Nivel ${person.level} · ${person.parentSide || "sem lado"}`}</dd></div><div><dt>Pai na matriz</dt><dd>{person.parentName || "-"}</dd></div><div><dt>Patrocinador</dt><dd>{person.directSponsorName || "-"}</dd></div><div><dt>Diretos validos</dt><dd>{person.activeVerifiedDirects ?? 0} de 2</dd></div><div><dt>Qualificacao</dt><dd>{person.qualified ? "Qualificado para a rede" : "Nao qualificado"}</dd></div>
      </dl>
      {person.networkEarningsBlockReason ? <div className="network-block-reason"><strong>Motivo do bloqueio</strong><p>{person.networkEarningsBlockReason}</p></div> : null}
      {canManage && !isRoot ? (
        <div className="network-member-actions">
          <button className="button button--secondary" onClick={() => onMove(person)} type="button"><ArrowLeftRight size={16} /> Mover na matriz</button>
          <button className={person.networkEarningsBlocked ? "button button--primary" : "button button--danger"} onClick={() => onOperation(person.networkEarningsBlocked ? "RELEASE_EARNINGS" : "BLOCK_EARNINGS", person)} type="button">{person.networkEarningsBlocked ? <CheckCircle2 size={16} /> : <CircleDollarSign size={16} />}{person.networkEarningsBlocked ? "Liberar ganhos" : "Bloquear ganhos"}</button>
          <button className={person.status !== "ATIVO" ? "button button--primary" : "button button--danger"} onClick={() => onOperation(person.status !== "ATIVO" ? "ACTIVATE_ACCOUNT" : "BLOCK_ACCOUNT", person)} type="button">{person.status !== "ATIVO" ? <CheckCircle2 size={16} /> : <Ban size={16} />}{person.status !== "ATIVO" ? "Ativar conta" : "Bloquear conta"}</button>
        </div>
      ) : <div className="network-root-note"><ShieldCheck size={18} /><span>{isRoot ? "A raiz operacional nao pode ser movida ou bloqueada nesta tela." : "Seu perfil possui acesso somente para consulta."}</span></div>}
    </aside>
  );
}

function NetworkPersonCard({ active = false, onFocus, onSelect, person, selected = false }) {
  return (
    <article className={`network-person-card ${active ? "is-focus" : ""} ${selected ? "is-selected" : ""}`}>
      <button className="network-person-card__main" onClick={() => onSelect(person)} type="button"><span className="avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.level === 0 ? "Raiz operacional" : `N${person.level} · ${person.parentSide || "sem lado"}`}</small></span></button>
      <div className="network-person-card__state"><span className={person.active ? "is-on" : ""}>{person.active ? "Ativo" : person.status}</span>{person.networkEarningsBlocked ? <em>Ganhos bloqueados</em> : person.qualified ? <em className="is-qualified">Qualificado</em> : null}</div>
      <button className="network-person-card__focus" onClick={() => onFocus(person, true)} type="button">Abrir ramo <ChevronRight size={14} /></button>
    </article>
  );
}

function OperationModal({ error, onCancel, onReasonChange, onSubmit, operating, operation, reason }) {
  const earningsOperation = operation.kind === "BLOCK_EARNINGS" || operation.kind === "RELEASE_EARNINGS";
  const destructive = operation.kind === "BLOCK_EARNINGS" || operation.kind === "BLOCK_ACCOUNT";
  const titles = { BLOCK_EARNINGS: "Bloquear ganhos futuros", RELEASE_EARNINGS: "Liberar ganhos da rede", BLOCK_ACCOUNT: "Bloquear conta", ACTIVATE_ACCOUNT: "Ativar conta" };
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}><section className="modal network-operation-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal__header"><div><p className="eyebrow">Acao administrativa</p><h2>{titles[operation.kind]}</h2></div><button className="icon-button" disabled={operating} onClick={onCancel} type="button"><X size={18} /></button></div>
      <div className={`network-operation-summary ${destructive ? "is-danger" : ""}`}><span>{destructive ? <AlertTriangle size={21} /> : <CheckCircle2 size={21} />}</span><div><strong>{operation.person.name}</strong><p>{earningsOperation ? "A alteracao vale para novas comissoes diretas e de matriz. O saldo anterior nao sera apagado." : "O acesso e as operacoes da conta serao atualizados imediatamente."}</p></div></div>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <form className="category-form" onSubmit={onSubmit}>{earningsOperation ? <label>Motivo obrigatorio<textarea autoFocus minLength={8} onChange={(event) => onReasonChange(event.target.value)} placeholder="Descreva o motivo para a auditoria" required rows={4} value={reason} /></label> : null}<div className="modal__actions"><button className="button button--secondary" disabled={operating} onClick={onCancel} type="button">Cancelar</button><button className={destructive ? "button button--danger" : "button button--primary"} disabled={operating} type="submit">{operating ? "Processando..." : "Confirmar operacao"}</button></div></form>
    </section></div>
  );
}

function DiagnosticCard({ count, items, title }) {
  return <article className="network-diagnostic"><div><strong>{title}</strong><span>{count.toLocaleString("pt-BR")}</span></div><ul>{items.slice(0, 4).map((item) => <li key={item.id}><span>{item.name}</span><small>{item.email} - {item.status}</small></li>)}</ul></article>;
}

function UserIdentity({ person }) {
  return <div className="user-identity"><span className="avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.email}</small></div></div>;
}

function buildVisibleLevels(focusPerson, people, depth) {
  if (!focusPerson) return [];
  const childrenByParent = new Map();
  people.forEach((person) => { const children = childrenByParent.get(person.parentId) ?? []; children.push(person); childrenByParent.set(person.parentId, children); });
  childrenByParent.forEach((children) => children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  const levels = [];
  let current = [focusPerson];
  for (let index = 0; index < depth; index += 1) { current = current.flatMap((person) => childrenByParent.get(person.id) ?? []); levels.push(current); }
  return levels;
}

function matchesStatus(person, filter) {
  if (filter === "ATIVOS") return person.status === "ATIVO";
  if (filter === "BLOQUEADOS") return person.status === "BLOQUEADO";
  if (filter === "QUALIFICADOS") return person.qualified;
  if (filter === "GANHOS_BLOQUEADOS") return person.networkEarningsBlocked;
  if (filter === "KYC_PENDENTE") return person.kycStatus !== "APROVADO";
  return true;
}

function initials(name = "") { return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatConnection(type) { if (type === "DIRETA") return "Direto"; if (type === "REDE") return "Rede"; return "Raiz"; }
function normalize(value = "") { return value.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

function collectDescendantIds(userId, people) {
  const childrenByParent = new Map();
  people.forEach((person) => { const children = childrenByParent.get(person.parentId) ?? []; children.push(person.id); childrenByParent.set(person.parentId, children); });
  const blocked = new Set([userId]);
  const queue = [userId];
  while (queue.length) {
    const parentId = queue.shift();
    for (const childId of childrenByParent.get(parentId) ?? []) { if (blocked.has(childId)) continue; blocked.add(childId); queue.push(childId); }
  }
  return blocked;
}
