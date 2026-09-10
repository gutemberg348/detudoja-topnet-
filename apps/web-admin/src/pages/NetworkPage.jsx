import {
  AlertTriangle,
  ArrowLeftRight,
  Database,
  GitBranch,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import { getAdminNetwork, moveAdminNetworkPlacement } from "../services/admin.api";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function NetworkPage({ accessToken, canManageNetwork = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [maxDepth, setMaxDepth] = useState(20);
  const [search, setSearch] = useState("");
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveForm, setMoveForm] = useState({ parentUserId: "", position: "1", reason: "" });
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");

  const loadNetwork = useCallback(async () => {
    setError("");
    try {
      setData(await getAdminNetwork(accessToken, { maxDepth }));
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar a rede.");
    }
  }, [accessToken, maxDepth]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  const tree = useMemo(() => {
    if (!data?.root) {
      return null;
    }

    return buildTree(data.root, data.people);
  }, [data]);
  const filteredPeople = useMemo(() => {
    if (!data) {
      return [];
    }

    const term = normalize(search);

    if (!term) {
      return data.people;
    }

    return data.people.filter((person) =>
      [
        person.name,
        person.email,
        person.parentName,
        person.parentEmail,
        person.parentSide,
        person.parentConnectionType,
        person.directSponsorName,
        person.directSponsorEmail,
        person.branch,
        person.status,
        person.kycStatus,
      ]
        .filter(Boolean)
        .some((value) => normalize(value).includes(term)),
    );
  }, [data, search]);

  const destinationPeople = useMemo(() => {
    if (!data?.root || !moveTarget) return [];
    const blocked = collectDescendantIds(moveTarget.id, data.people);
    return [data.root, ...data.people].filter((person) => !blocked.has(person.id));
  }, [data, moveTarget]);

  function openMove(person) {
    setMoveError("");
    setMoveTarget(person);
    setMoveForm({
      parentUserId: person.parentId ? String(person.parentId) : "",
      position: String(person.position || 1),
      reason: "",
    });
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
      setMoveTarget(null);
    } catch (requestError) {
      setMoveError(requestError.message || "Nao foi possivel reposicionar o participante.");
    } finally {
      setMoving(false);
    }
  }

  if (!data && !error) {
    return <PageLoading label="Carregando rede" />;
  }

  if (!data) {
    return <PageError message={error} onRetry={loadNetwork} />;
  }

  const metrics = [
    {
      icon: UsersRound,
      label: "Na matriz",
      meta: `${data.summary.active} ativos`,
      value: data.summary.total,
    },
    {
      icon: GitBranch,
      label: "Diretos da raiz",
      meta: "Patrocinados pela empresa",
      value: data.summary.directToRoot,
    },
    {
      icon: ShieldCheck,
      label: "Verificados",
      meta: `${data.summary.qualified} qualificados`,
      value: data.summary.verified,
    },
    {
      icon: AlertTriangle,
      label: "Diagnostico",
      meta: `${data.summary.unallocated} sem alocacao`,
      value: data.summary.orphans,
    },
  ];

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Matriz global</p>
          <h1>Rede</h1>
          <p>Veja a arvore completa da empresa, os lados da matriz e possiveis cadastros soltos.</p>
        </div>
        <button className="button button--secondary" onClick={loadNetwork} type="button">
          <RefreshCw size={16} />
          Atualizar
        </button>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="metric-grid" aria-label="Resumo da rede">
        {metrics.map(({ icon: Icon, label, meta, value }) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__icon"><Icon size={20} /></span>
            <div>
              <span>{label}</span>
              <strong>{Number(value).toLocaleString("pt-BR")}</strong>
              <small>{meta}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="toolbar toolbar--network" aria-label="Filtros da rede">
        <form className="search-field" onSubmit={(event) => event.preventDefault()}>
          <Search size={18} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pessoa, e-mail, patrocinador, lado ou status"
            value={search}
          />
        </form>
        <select
          aria-label="Profundidade da arvore"
          onChange={(event) => setMaxDepth(Number(event.target.value))}
          value={maxDepth}
        >
          <option value={3}>3 niveis</option>
          <option value={5}>5 niveis</option>
          <option value={10}>10 niveis</option>
          <option value={20}>20 niveis</option>
        </select>
      </section>

      {data.diagnostics.orphanUsers.length || data.diagnostics.unallocatedIndications.length ? (
        <section className="network-alerts" aria-label="Diagnostico da rede">
          {data.diagnostics.orphanUsers.length ? (
            <DiagnosticCard
              count={data.diagnostics.orphanUsers.length}
              items={data.diagnostics.orphanUsers}
              title="Usuarios sem indicacao"
            />
          ) : null}
          {data.diagnostics.unallocatedIndications.length ? (
            <DiagnosticCard
              count={data.diagnostics.unallocatedIndications.length}
              items={data.diagnostics.unallocatedIndications.map((item) => ({
                createdAt: item.createdAt,
                email: item.indicatedEmail,
                id: item.id,
                name: item.indicatedName,
                status: item.status,
              }))}
              title="Indicacoes sem alocacao"
            />
          ) : null}
        </section>
      ) : null}

      <section className="data-section network-section">
        <div className="section-heading">
          <div>
            <h2>Arvore da matriz</h2>
            <p>Raiz atual: {data.root?.name || "nao encontrada"}</p>
          </div>
          <span className="network-hint">Linhas = ligados na matriz</span>
        </div>
        {tree ? (
          <div className="network-tree-scroll">
            <div className="network-tree">
              <TreeNode canMove={canManageNetwork} node={tree} onMove={openMove} root />
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <GitBranch size={24} />
            <p>Raiz da empresa ainda nao existe. Rode o seed ou cadastre alguem sem codigo.</p>
          </div>
        )}
      </section>

      <section className="network-rules" aria-label="Como a rede funciona">
        <div className="section-heading">
          <div><h2>Como a matriz funciona no banco</h2><p>Duas ligacoes independentes evitam confundir indicacao com derramamento.</p></div>
          <Database size={20} />
        </div>
        <div className="network-rules__grid">
          <article><span>1</span><strong>Patrocinador direto</strong><p><code>indicador_usuario_id</code> nunca muda ao reposicionar. Ele define a indicacao e o bonus direto.</p></article>
          <article><span>2</span><strong>Pai da matriz</strong><p><code>alocado_sob_usuario_id</code> liga a pessoa ao pai real; <code>posicao_matriz</code> guarda esquerda ou direita.</p></article>
          <article><span>3</span><strong>Derramamento 2x20</strong><p>Cada pai possui duas vagas. A arvore percorre as ligacoes reais por ate 20 niveis.</p></article>
          <article><span>4</span><strong>Ganhos futuros</strong><p>Mover preserva patrocinador e subarvore. Somente os ancestrais da rede futura mudam; valores pagos nao sao reescritos.</p></article>
        </div>
      </section>

      <section className="data-section data-section--flush">
        <div className="result-line">
          <strong>{filteredPeople.length.toLocaleString("pt-BR")}</strong> registros encontrados na matriz
        </div>
        <div className="table-scroll">
          <table className="network-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Nivel</th>
                <th>Lado no pai</th>
                <th>Ligacao</th>
                <th>Alocada sob</th>
                <th>Patrocinador</th>
                <th>Status</th>
                <th>KYC</th>
                <th>Entrada</th>
                {canManageNetwork ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredPeople.slice(0, 200).map((person) => (
                <tr key={person.id}>
                  <td><UserIdentity person={person} /></td>
                  <td>
                    <strong className="table-primary">Nivel {person.level}</strong>
                    <small className="table-secondary">Perna {person.branch || "-"}</small>
                  </td>
                  <td>
                    <strong className="table-primary">{person.parentSide || "-"}</strong>
                    <small className="table-secondary">Posicao {person.position || "-"}</small>
                  </td>
                  <td>
                    <strong className="table-primary">{formatConnection(person.parentConnectionType)}</strong>
                    <small className="table-secondary">
                      {person.reward?.direct ? "Ganho direto" : "Ganho de rede"}
                    </small>
                  </td>
                  <td>
                    <strong className="table-primary">{person.parentName || "-"}</strong>
                    <small className="table-secondary">{person.parentEmail || ""}</small>
                  </td>
                  <td>
                    <strong className="table-primary">{person.directSponsorName || "-"}</strong>
                    <small className="table-secondary">{person.directSponsorEmail || ""}</small>
                  </td>
                  <td><StatusBadge status={person.status} /></td>
                  <td><StatusBadge status={person.kycStatus} /></td>
                  <td>{dateFormatter.format(new Date(person.createdAt))}</td>
                  {canManageNetwork ? <td><button className="button button--secondary" onClick={() => openMove(person)} type="button"><ArrowLeftRight size={15} /> Mover</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPeople.length > 200 ? (
          <div className="result-line">Mostrando os primeiros 200 registros filtrados.</div>
        ) : null}
        {!filteredPeople.length ? (
          <div className="empty-state">
            <UserRound size={24} />
            <p>Nenhuma pessoa encontrada na matriz com esse filtro.</p>
          </div>
        ) : null}
      </section>

      {moveTarget ? (
        <div className="modal-backdrop" onMouseDown={() => !moving && setMoveTarget(null)}>
          <section className="modal network-move-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <div><p className="eyebrow">Posicao matricial</p><h2>Mover {moveTarget.name}</h2></div>
              <button className="icon-button" disabled={moving} onClick={() => setMoveTarget(null)} title="Fechar" type="button"><X size={18} /></button>
            </div>
            <div className="network-move-warning"><LockKeyhole size={19} /><p>O patrocinador direto permanece <strong>{moveTarget.directSponsorName || "inalterado"}</strong>. A subarvore acompanha a pessoa movida.</p></div>
            {moveError ? <div className="inline-error" role="alert">{moveError}</div> : null}
            <form className="category-form" onSubmit={submitMove}>
              <label>Novo pai na matriz
                <select required onChange={(event) => setMoveForm((current) => ({ ...current, parentUserId: event.target.value }))} value={moveForm.parentUserId}>
                  <option value="">Selecione o destino</option>
                  {destinationPeople.map((person) => <option key={person.id} value={person.id}>{person.name} - ID {person.id}{person.level === 0 ? " (raiz)" : ` - nivel ${person.level}`}</option>)}
                </select>
              </label>
              <label>Lado
                <select onChange={(event) => setMoveForm((current) => ({ ...current, position: event.target.value }))} value={moveForm.position}>
                  <option value="1">Esquerda - posicao 1</option><option value="2">Direita - posicao 2</option>
                </select>
              </label>
              <label>Motivo da alteracao
                <textarea minLength={8} onChange={(event) => setMoveForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Ex.: correcao de alocacao autorizada" required rows={3} value={moveForm.reason} />
              </label>
              <div className="modal__actions"><button className="button button--secondary" disabled={moving} onClick={() => setMoveTarget(null)} type="button">Cancelar</button><button className="button button--primary" disabled={moving} type="submit"><ArrowLeftRight size={16} /> Confirmar mudanca</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DiagnosticCard({ count, items, title }) {
  return (
    <article className="network-diagnostic">
      <div>
        <strong>{title}</strong>
        <span>{count.toLocaleString("pt-BR")}</span>
      </div>
      <ul>
        {items.slice(0, 4).map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <small>{item.email} - {item.status}</small>
          </li>
        ))}
      </ul>
    </article>
  );
}

function TreeNode({ canMove, node, onMove, root = false }) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="network-node-wrap">
      <button className={`network-node ${root ? "network-node--root" : ""}`} disabled={root || !canMove} onClick={() => onMove(node.person)} title={root ? "Raiz da empresa" : canMove ? "Reposicionar participante" : "Participante da matriz"} type="button">
        <span>{initials(node.person.name)}</span>
        <strong>{node.person.name}</strong>
        <small>{root ? "Raiz" : `N${node.person.level} ${node.person.parentSide || ""}`}</small>
        {!root ? (
          <em
            className={`network-node__link ${
              node.person.parentConnectionType === "DIRETA"
                ? "network-node__link--direct"
                : "network-node__link--network"
            }`}
          >
            {formatConnection(node.person.parentConnectionType)}
          </em>
        ) : null}
      </button>
      {hasChildren ? (
        <div
          className={`network-node-children ${
            node.children.length > 1 ? "network-node-children--multi" : ""
          }`}
        >
          {node.children.map((child) => (
            <TreeNode canMove={canMove} key={child.person.id} node={child} onMove={onMove} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserIdentity({ person }) {
  return (
    <div className="user-identity">
      <span className="avatar">{initials(person.name)}</span>
      <div>
        <strong>{person.name}</strong>
        <small>{person.email}</small>
      </div>
    </div>
  );
}

function buildTree(root, people) {
  const childrenByParent = new Map();

  people.forEach((person) => {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person);
    childrenByParent.set(person.parentId, children);
  });

  childrenByParent.forEach((children) => {
    children.sort((first, second) => {
      if (first.position !== second.position) {
        return (first.position ?? 0) - (second.position ?? 0);
      }

      return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    });
  });

  function createNode(person) {
    return {
      children: (childrenByParent.get(person.id) ?? []).map(createNode),
      person,
    };
  }

  return createNode(root);
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatConnection(connectionType) {
  if (connectionType === "DIRETA") {
    return "Direto";
  }

  if (connectionType === "REDE") {
    return "Rede";
  }

  return "Raiz";
}

function normalize(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collectDescendantIds(userId, people) {
  const childrenByParent = new Map();
  people.forEach((person) => {
    const children = childrenByParent.get(person.parentId) ?? [];
    children.push(person.id);
    childrenByParent.set(person.parentId, children);
  });
  const blocked = new Set([userId]);
  const queue = [userId];
  while (queue.length) {
    const parentId = queue.shift();
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (blocked.has(childId)) continue;
      blocked.add(childId);
      queue.push(childId);
    }
  }
  return blocked;
}
