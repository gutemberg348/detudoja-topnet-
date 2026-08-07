import { BriefcaseBusiness, Edit3, Hash, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createAdminSegment,
  deleteAdminSegment,
  getAdminCategories,
  getAdminSegments,
  updateAdminSegment,
} from "../services/admin.api";
import { PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";

const emptyForm = {
  categoryId: "",
  description: "",
  iconName: "",
  name: "",
  orderFlow: "DIRECT_CHECKOUT",
  sortOrder: 0,
  status: "ATIVO",
};

export function SegmentsPage({ accessToken }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [segments, setSegments] = useState(null);

  const loadSegments = useCallback(async () => {
    setError("");
    try {
      const response = await getAdminSegments(accessToken, { search });
      setSegments(response.segments);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar os segmentos.");
    }
  }, [accessToken, search]);

  useEffect(() => {
    const timer = setTimeout(loadSegments, 250);
    return () => clearTimeout(timer);
  }, [loadSegments]);

  useEffect(() => {
    getAdminCategories(accessToken)
      .then((response) => setCategories(response.categories ?? []))
      .catch(() => setCategories([]));
  }, [accessToken]);

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(false);
  }

  function openForm(segment = null) {
    setEditing(segment);
    setForm(
      segment
        ? {
            categoryId: segment.categoryId ? String(segment.categoryId) : "",
            description: segment.description ?? "",
            iconName: segment.iconName ?? "",
            name: segment.name,
            orderFlow: segment.orderFlow ?? "DIRECT_CHECKOUT",
            sortOrder: segment.sortOrder ?? 0,
            status: segment.status,
          }
        : emptyForm,
    );
    setError("");
    setModalOpen(true);
  }

  async function saveSegment(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) await updateAdminSegment(accessToken, editing.id, form);
      else await createAdminSegment(accessToken, form);
      closeForm();
      await loadSegments();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar o segmento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSegment(segment) {
    if (!window.confirm(`Desativar o segmento ${segment.name}?`)) return;
    setError("");
    try {
      await deleteAdminSegment(accessToken, segment.id);
      await loadSegments();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel desativar o segmento.");
    }
  }

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Vendas e prestadores</p>
          <h1>Segmentos</h1>
          <p>Defina as areas que o usuario pode escolher antes de vender.</p>
        </div>
        <button className="button button--primary" onClick={() => openForm()} type="button">
          <Plus size={18} />Novo segmento
        </button>
      </header>

      <section className="toolbar toolbar--categories">
        <label className="search-field">
          <Search size={18} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar segmento"
            value={search}
          />
        </label>
      </section>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {!segments ? <PageLoading label="Carregando segmentos" /> : null}
      {segments ? (
        <section className="category-list" aria-label="Segmentos cadastrados">
          {segments.map((segment) => (
            <article className="category-row" key={segment.id}>
              <span className="category-row__icon">
                <BriefcaseBusiness size={21} />
              </span>
              <div className="category-row__body">
                <div>
                  <h2>{segment.name}</h2>
                  <StatusBadge status={segment.status} />
                </div>
                <p>{segment.description || "Sem descricao"}</p>
                <small>
                  {segment.category?.name ?? "Sem categoria"} - {segment.orderFlow === "CHAT_NEGOTIATION" ? "Negociacao por chat" : "Checkout direto"} - {segment.storesCount} loja(s)
                </small>
              </div>
              <div className="category-row__actions">
                <button className="icon-button" onClick={() => openForm(segment)} title="Editar segmento" type="button">
                  <Edit3 size={18} />
                </button>
                <button className="icon-button icon-button--danger" onClick={() => removeSegment(segment)} title="Desativar segmento" type="button">
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
          {!segments.length ? (
            <div className="empty-state">
              <Tags size={24} />
              <p>Nenhum segmento cadastrado.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" onMouseDown={closeForm}>
          <section
            aria-labelledby="segment-modal-title"
            aria-modal="true"
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal__header">
              <div>
                <p className="eyebrow">Segmentos</p>
                <h2 id="segment-modal-title">{editing ? "Editar segmento" : "Novo segmento"}</h2>
              </div>
              <button className="icon-button" onClick={closeForm} title="Fechar" type="button">
                <X size={19} />
              </button>
            </div>
            <form className="category-form" onSubmit={saveSegment}>
              <label>
                Nome
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Venda autonoma"
                  required
                  value={form.name}
                />
              </label>
              <label>
                Categoria
                <select
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  required
                  value={form.categoryId}
                >
                  <option value="">Selecione a categoria principal</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Fluxo dos pedidos online
                <select
                  onChange={(event) => setForm((current) => ({ ...current, orderFlow: event.target.value }))}
                  value={form.orderFlow}
                >
                  <option value="DIRECT_CHECKOUT">Checkout direto: endereco e pagamento</option>
                  <option value="CHAT_NEGOTIATION">Negociacao por chat antes do pagamento</option>
                </select>
              </label>
              <label>
                Descricao
                <textarea
                  maxLength={1000}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Explique quais vendedores entram nesse segmento"
                  rows={3}
                  value={form.description}
                />
              </label>
              <label>
                Icone
                <span className="input-with-icon">
                  <Tags size={18} />
                  <input
                    maxLength={80}
                    onChange={(event) => setForm((current) => ({ ...current, iconName: event.target.value }))}
                    placeholder="Ex.: storefront"
                    value={form.iconName}
                  />
                </span>
              </label>
              <label>
                Ordem
                <span className="input-with-icon">
                  <Hash size={18} />
                  <input
                    min={0}
                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                    type="number"
                    value={form.sortOrder}
                  />
                </span>
              </label>
              <label>
                Status
                <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </label>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="modal__actions">
                <button className="button button--secondary" onClick={closeForm} type="button">Cancelar</button>
                <button className="button button--primary" disabled={saving} type="submit">
                  {saving ? "Salvando..." : "Salvar segmento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
