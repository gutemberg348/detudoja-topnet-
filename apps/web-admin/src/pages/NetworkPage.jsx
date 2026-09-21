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
const MAX_NETWORK_DEPTH = 20;

export function NetworkPage({ accessToken, canManageNetwork = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [visibleDepth, setVisibleDepth] = useState(MAX_NETWORK_DEPTH);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [focusId, setFocusId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [treeScale, setTreeScale] = useState(1);
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
      const response = await getAdminNetwork(accessToken, { maxDepth: MAX_NETWORK_DEPTH });
      setData(response);
      const responseIds = new Set([response.root, ...(response.people ?? [])].filter(Boolean).map((person) => person.id));
      setFocusId((current) => responseIds.has(current) ? current : response.root?.id ?? null);
      setSelectedId((current) => responseIds.has(current) ? current : response.root?.id ?? null);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar a rede.");
    }
  }, [accessToken]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  useEffect(() => {
    if (!inspectorOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setInspectorOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inspectorOpen]);

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
  const visibleTree = useMemo(
    () => buildVisibleTree(focusPerson, data?.people ?? [], visibleDepth),
    [data?.people, focusPerson, visibleDepth],
  );
  const visibleNodeCount = useMemo(() => countTreeNodes(visibleTree), [visibleTree]);
  const selectedPath = useMemo(
    () => buildAncestorPath(selectedPerson, peopleById),
    [peopleById, selectedPerson],
  );
  const selectedStats = useMemo(
    () => buildMemberStats(selectedPerson, data?.people ?? []),
    [data?.people, selectedPerson],
  );
  const searchSuggestions = useMemo(() => {
    const term = normalize(search).trim();
    if (term.length < 2) return [];
    return allPeople
      .filter((person) => [person.name, person.email, person.phone, person.id, person.publicIdentifier]
        .filter(Boolean)
        .some((value) => normalize(value).includes(term)))
      .slice(0, 8);
  }, [allPeople, search]);
  const filteredPeople = useMemo(() => {
    const term = normalize(search);
    return (data?.people ?? []).filter((person) => {
      if (!matchesStatus(person, statusFilter)) return false;
      if (!term) return true;
      return [person.name, person.email, person.phone, person.publicIdentifier, person.id,
        person.parentName, person.parentEmail,
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
    setInspectorOpen(true);
  }

  function locatePerson(person) {
    setSelectedId(person.id);
    setFocusId(person.id);
    setInspectorOpen(true);
    setSearch("");
    window.requestAnimationFrame(() => {
      document.querySelector(".network-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
        <div className="network-search-locator">
          <form className="search-field" onSubmit={(event) => { event.preventDefault(); if (searchSuggestions[0]) locatePerson(searchSuggestions[0]); }}><Search size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Localizar usuario por nome, e-mail, telefone ou ID" value={search} /></form>
          {searchSuggestions.length ? (
            <div className="network-search-results">
              <span className="network-search-results__label">Encontrados na matriz</span>
              {searchSuggestions.map((person) => (
                <button key={person.id} onClick={() => locatePerson(person)} type="button">
                  <span className="avatar">{initials(person.name)}</span>
                  <span><strong>{person.name}</strong><small>{person.email}</small></span>
                  <em>{person.level === 0 ? "Raiz" : `Nível ${person.level} · ${person.parentSide || "-"}`}</em>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <select aria-label="Filtrar situacao" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="TODOS">Todos os participantes</option><option value="ATIVOS">Contas ativas</option><option value="BLOQUEADOS">Contas bloqueadas</option><option value="QUALIFICADOS">Qualificados</option><option value="GANHOS_BLOQUEADOS">Ganhos bloqueados</option><option value="KYC_PENDENTE">KYC pendente</option>
        </select>
        <select aria-label="Níveis exibidos" onChange={(event) => setVisibleDepth(Number(event.target.value))} value={visibleDepth}>
          {Array.from({ length: MAX_NETWORK_DEPTH }, (_, index) => index + 1).map((depth) => (
            <option key={depth} value={depth}>{depth === MAX_NETWORK_DEPTH ? "Toda a matriz · 20 níveis" : `${depth} ${depth === 1 ? "nível" : "níveis"}`}</option>
          ))}
        </select>
      </section>

      {data.diagnostics.orphanUsers.length || data.diagnostics.unallocatedIndications.length ? (
        <details className="network-diagnostics">
          <summary><AlertTriangle size={17} /><strong>Diagnóstico da matriz</strong><span>{data.diagnostics.orphanUsers.length + data.diagnostics.unallocatedIndications.length} cadastros precisam de atenção</span><ChevronRight size={17} /></summary>
          <section className="network-alerts" aria-label="Diagnóstico da rede">
            {data.diagnostics.orphanUsers.length ? <DiagnosticCard count={data.diagnostics.orphanUsers.length} items={data.diagnostics.orphanUsers} title="Usuários sem indicação" /> : null}
            {data.diagnostics.unallocatedIndications.length ? <DiagnosticCard count={data.diagnostics.unallocatedIndications.length} items={data.diagnostics.unallocatedIndications.map((item) => ({ email: item.indicatedEmail, id: item.id, name: item.indicatedName, status: item.status }))} title="Indicações sem alocação" /> : null}
          </section>
        </details>
      ) : null}

      <article className="data-section network-explorer network-tree-workspace">
        <div className="section-heading network-explorer__heading">
          <div>
            <span className="network-section-kicker"><GitBranch size={14} /> Visualização principal</span>
            <h2>Árvore completa da matriz</h2>
            <p>A rede desce da raiz para os participantes. Clique em qualquer pessoa para consultar e administrar.</p>
          </div>
          <div className="network-explorer__nav">
            <button className="button button--secondary" disabled={!focusPerson?.parentId} onClick={() => setFocusId(focusPerson?.parentId)} type="button"><ArrowLeft size={15} /> Subir um nível</button>
            <button className="button button--secondary" disabled={focusId === data.root?.id} onClick={() => setFocusId(data.root?.id)} type="button">Mostrar desde a raiz</button>
          </div>
        </div>
        {visibleTree ? (
          <div className="network-tree-commandbar">
            <div className="network-tree-focus"><span className="avatar">{initials(focusPerson.name)}</span><span><small>Ramo em foco</small><strong>{focusPerson.name}</strong></span></div>
            <div className="network-tree-summary">
              <span><strong>{visibleNodeCount}</strong> pessoas visíveis</span>
              <span><strong>{visibleDepth}</strong> {visibleDepth === 1 ? "nível exibido" : "níveis exibidos"}</span>
              <span><strong>{data.summary.total}</strong> participantes carregados</span>
            </div>
            <div className="network-zoom" aria-label="Zoom da árvore">
              <button disabled={treeScale <= 0.65} onClick={() => setTreeScale((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))} type="button">−</button>
              <span>{Math.round(treeScale * 100)}%</span>
              <button disabled={treeScale >= 1.25} onClick={() => setTreeScale((value) => Math.min(1.25, Number((value + 0.1).toFixed(2))))} type="button">+</button>
              <button className="network-zoom__reset" onClick={() => setTreeScale(1)} type="button">Ajustar</button>
            </div>
          </div>
        ) : null}
        {visibleTree ? (
          <div className="network-tree-scroll"><div className="network-tree" style={{ zoom: treeScale }}>
            <NetworkTreeNode focusId={focusPerson.id} node={visibleTree} onFocus={selectPerson} onSelect={selectPerson} selectedId={selectedId} />
          </div></div>
        ) : <div className="empty-state"><GitBranch size={24} /><p>Raiz da empresa ainda não existe.</p></div>}
        <div className="network-tree-footer">
          <span><i className="is-active" /> Conta ativa</span><span><i className="is-blocked" /> Conta ou ganhos bloqueados</span>
          <p>Use a rolagem horizontal quando o ramo ficar largo. “Focar ramo” traz qualquer participante para o topo sem perder seus dados.</p>
        </div>
      </article>

      {inspectorOpen && selectedPerson ? (
        <div className="network-inspector-backdrop" onMouseDown={() => setInspectorOpen(false)}>
          <div aria-label="Controles do participante" aria-modal="true" className="network-inspector" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <MemberControlPanel canManage={canManageNetwork} isRoot={selectedPerson.id === data.root?.id} onClose={() => setInspectorOpen(false)} onLocate={locatePerson} onMove={openMove} onOperation={openOperation} path={selectedPath} person={selectedPerson} stats={selectedStats} />
          </div>
        </div>
      ) : null}

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

function MemberControlPanel({ canManage, isRoot, onClose, onLocate, onMove, onOperation, path, person, stats }) {
  if (!person) return null;
  return (
    <aside className="network-member-panel">
      <div className="network-member-panel__hero"><span className="avatar">{initials(person.name)}</span><div><p className="eyebrow">Participante selecionado</p><h2>{person.name}</h2><span>{person.email}</span><small>ID {person.id}{person.publicIdentifier ? ` · @${person.publicIdentifier}` : ""}</small></div><button aria-label="Fechar detalhes" className="network-member-panel__close" onClick={onClose} type="button"><X size={18} /></button></div>
      <div className="network-member-panel__badges"><StatusBadge status={person.status} /><StatusBadge status={person.kycStatus} />{person.networkEarningsBlocked ? <span className="network-pill network-pill--danger">Ganhos bloqueados</span> : <span className="network-pill">Ganhos liberados</span>}</div>
      <div className="network-member-path">
        <span>CAMINHO NA MATRIZ</span>
        <div>{path.map((item, index) => <span key={item.id}><button onClick={() => onLocate(item)} title={`Localizar ${item.name}`} type="button">{index === 0 ? "Raiz" : initials(item.name)}</button>{index < path.length - 1 ? <ChevronRight size={12} /> : null}</span>)}</div>
      </div>
      <button className="network-member-panel__locate" onClick={() => onLocate(person)} type="button"><GitBranch size={15} /> Centralizar este ramo na árvore</button>
      <div className="network-member-stats">
        <MemberStat label="Pessoas abaixo" value={stats.totalBelow} />
        <MemberStat label="Filhos na matriz" value={`${stats.directChildren}/2`} />
        <MemberStat label="Ativos abaixo" value={stats.activeBelow} />
        <MemberStat label="Qualificados" value={stats.qualifiedBelow} />
      </div>
      <p className="network-member-section-title">Posição e indicação</p>
      <dl className="network-member-details">
        <div><dt>Posição</dt><dd>{person.level === 0 ? "Raiz operacional" : `Nível ${person.level} · ${person.parentSide || "sem lado"}`}</dd></div>
        <div><dt>Perna principal</dt><dd>{person.branch || "-"}</dd></div>
        <div><dt>Pai na matriz</dt><dd>{person.parentName || "-"}</dd></div>
        <div><dt>Ligação com o pai</dt><dd>{formatConnection(person.parentConnectionType)}</dd></div>
        <div><dt>Patrocinador</dt><dd>{person.directSponsorName || "-"}</dd></div>
        <div><dt>Diretos válidos</dt><dd>{person.activeVerifiedDirects ?? 0} de 2</dd></div>
        <div><dt>Qualificação</dt><dd>{person.qualified ? "Qualificado para a rede" : "Não qualificado"}</dd></div>
      </dl>
      <p className="network-member-section-title">Conta do participante</p>
      <dl className="network-member-details">
        <div><dt>Tipo de conta</dt><dd>{formatAccountType(person.accountType)}</dd></div>
        <div><dt>Telefone</dt><dd>{person.phone || "Não informado"}</dd></div>
        <div><dt>Localidade</dt><dd>{[person.city, person.state].filter(Boolean).join("/") || "Não informada"}</dd></div>
        <div><dt>Nível KYC</dt><dd>{person.kycLevel || "-"}</dd></div>
        <div><dt>Cadastro</dt><dd>{formatDateTime(person.createdAt)}</dd></div>
        <div><dt>Último acesso</dt><dd>{formatDateTime(person.lastLoginAt)}</dd></div>
        <div><dt>Maior nível abaixo</dt><dd>{stats.deepestLevel ? `Nível ${stats.deepestLevel}` : "Sem descendentes"}</dd></div>
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

function MemberStat({ label, value }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function NetworkTreeNode({ focusId, node, onFocus, onSelect, selectedId }) {
  const { children, hasHiddenChildren, person } = node;
  const selected = person.id === selectedId;
  const focused = person.id === focusId;
  return (
    <div className="network-node-wrap">
      <article className={`network-tree-person ${focused ? "is-focus" : ""} ${selected ? "is-selected" : ""} ${person.networkEarningsBlocked ? "is-blocked" : ""}`}>
        <button aria-label={`Ver informações de ${person.name}`} className="network-tree-orb" onClick={() => onSelect(person)} type="button">
          <span>{initials(person.name)}</span>
          <i className={person.active ? "is-online" : ""} />
        </button>
        <strong title={person.name}>{person.name}</strong>
        <small>{person.level === 0 ? "Raiz operacional" : `N${person.level} · ${person.parentSide || "sem lado"}`}</small>
        <div className="network-tree-person__badges">
          <em className={person.parentConnectionType === "DIRETA" ? "is-direct" : ""}>{formatConnection(person.parentConnectionType)}</em>
          {person.qualified ? <em className="is-qualified">Qualificado</em> : null}
        </div>
        <button className="network-tree-person__focus" onClick={() => onFocus(person, true)} type="button">{hasHiddenChildren ? "Continuar daqui" : "Focar ramo"} <ChevronRight size={12} /></button>
      </article>
      {children.length ? (
        <div className={`network-node-children ${children.length > 1 ? "network-node-children--multi" : ""}`}>
          {children.map((child) => <NetworkTreeNode focusId={focusId} key={child.person.id} node={child} onFocus={onFocus} onSelect={onSelect} selectedId={selectedId} />)}
        </div>
      ) : null}
    </div>
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

function buildVisibleTree(focusPerson, people, depth) {
  if (!focusPerson) return null;
  const childrenByParent = new Map();
  people.forEach((person) => { const children = childrenByParent.get(person.parentId) ?? []; children.push(person); childrenByParent.set(person.parentId, children); });
  childrenByParent.forEach((children) => children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  function build(person, remainingDepth) {
    const availableChildren = childrenByParent.get(person.id) ?? [];
    return {
      children: remainingDepth > 0
        ? availableChildren.map((child) => build(child, remainingDepth - 1))
        : [],
      hasHiddenChildren: remainingDepth <= 0 && availableChildren.length > 0,
      person,
    };
  }
  return build(focusPerson, depth);
}

function countTreeNodes(node) {
  if (!node) return 0;
  return 1 + node.children.reduce((total, child) => total + countTreeNodes(child), 0);
}

function buildAncestorPath(person, peopleById) {
  if (!person) return [];
  const path = [];
  const visited = new Set();
  let current = person;
  while (current && !visited.has(current.id)) {
    path.unshift(current);
    visited.add(current.id);
    current = current.parentId ? peopleById.get(current.parentId) : null;
  }
  return path;
}

function buildMemberStats(person, people) {
  if (!person) return { activeBelow: 0, directChildren: 0, deepestLevel: 0, qualifiedBelow: 0, totalBelow: 0 };
  const childrenByParent = new Map();
  people.forEach((item) => {
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentId, children);
  });
  const directChildren = childrenByParent.get(person.id) ?? [];
  const descendants = [];
  const queue = [...directChildren];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    descendants.push(current);
    queue.push(...(childrenByParent.get(current.id) ?? []));
  }
  return {
    activeBelow: descendants.filter((item) => item.active).length,
    directChildren: directChildren.length,
    deepestLevel: descendants.reduce((maximum, item) => Math.max(maximum, item.level ?? 0), 0),
    qualifiedBelow: descendants.filter((item) => item.qualified).length,
    totalBelow: descendants.length,
  };
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
function formatAccountType(type) { return ({ CONSUMIDOR: "Consumidor", LOJISTA: "Lojista", VENDEDOR: "Prestador" })[type] ?? type ?? "-"; }
function formatDateTime(value) { return value ? dateFormatter.format(new Date(value)) : "Nunca"; }
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
