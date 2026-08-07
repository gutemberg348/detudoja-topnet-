import {
  Edit3,
  Image as ImageIcon,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import {
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategories,
  updateAdminCategory,
} from "../services/admin.api";
import { apiBaseUrl } from "../services/api";

const emptyForm = {
  description: "",
  name: "",
  status: "ATIVA",
};

export function CategoriesPage({ accessToken }) {
  const [categories, setCategories] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const loadCategories = useCallback(async () => {
    setError("");

    try {
      const response = await getAdminCategories(accessToken, { search });
      setCategories(response.categories);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível carregar as categorias.");
    }
  }, [accessToken, search]);

  useEffect(() => {
    const timer = setTimeout(loadCategories, 250);
    return () => clearTimeout(timer);
  }, [loadCategories]);

  useEffect(() => {
    return () => {
      if (iconPreview.startsWith("blob:")) {
        URL.revokeObjectURL(iconPreview);
      }
    };
  }, [iconPreview]);

  function openForm(category = null) {
    setEditing(category);
    setForm(
      category
        ? {
            description: category.description ?? "",
            name: category.name,
            status: category.status,
          }
        : emptyForm,
    );
    setIconFile(null);
    setIconPreview(resolveMediaUrl(category?.iconUrl));
    setModalOpen(true);
    setError("");
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setIconFile(null);
    setIconPreview("");
    setModalOpen(false);
  }

  function selectIcon(event) {
    const file = event.target.files?.[0] ?? null;
    setIconFile(file);

    if (file) {
      setIconPreview(URL.createObjectURL(file));
    }
  }

  function buildCategoryBody() {
    const body = new FormData();

    body.append("description", form.description ?? "");
    body.append("name", form.name ?? "");
    body.append("status", form.status ?? "ATIVA");

    if (iconFile) {
      body.append("icon", iconFile);
    }

    return body;
  }

  async function saveCategory(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const body = buildCategoryBody();

      if (editing) {
        await updateAdminCategory(accessToken, editing.id, body);
      } else {
        await createAdminCategory(accessToken, body);
      }

      closeForm();
      await loadCategories();
    } catch (requestError) {
      setError(requestError.message || "Não foi possível salvar a categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Excluir a categoria ${category.name}?`)) {
      return;
    }

    setError("");

    try {
      await deleteAdminCategory(accessToken, category.id);
      await loadCategories();
    } catch (requestError) {
      setError(requestError.message || "Não foi possível excluir a categoria.");
    }
  }

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Catálogo do aplicativo</p>
          <h1>Categorias</h1>
          <p>Organize os tipos de lojas e serviços exibidos aos clientes.</p>
        </div>
        <button className="button button--primary" onClick={() => openForm()} type="button">
          <Plus size={18} />
          Nova categoria
        </button>
      </header>

      <section className="toolbar toolbar--categories">
        <label className="search-field">
          <Search size={18} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar categoria"
            value={search}
          />
        </label>
      </section>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {!categories ? <PageLoading label="Carregando categorias" /> : null}

      {categories ? (
        <section className="category-list" aria-label="Categorias cadastradas">
          {categories.map((category) => (
            <article className="category-row" key={category.id}>
              <span className="category-row__icon">
                {category.iconUrl ? (
                  <img alt="" src={resolveMediaUrl(category.iconUrl)} />
                ) : (
                  <Tag size={21} />
                )}
              </span>
              <div className="category-row__body">
                <div>
                  <h2>{category.name}</h2>
                  <StatusBadge status={category.status} />
                </div>
                <p>{category.description || "Sem descrição"}</p>
                <small>
                  {category.segmentsCount} {category.segmentsCount === 1 ? "segmento" : "segmentos"} - {category.storesCount}{" "}
                  {category.storesCount === 1 ? "loja vinculada" : "lojas vinculadas"}
                </small>
              </div>
              <div className="category-row__actions">
                <button
                  className="icon-button"
                  onClick={() => openForm(category)}
                  title="Editar categoria"
                  type="button"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  className="icon-button icon-button--danger"
                  onClick={() => removeCategory(category)}
                  title="Excluir categoria"
                  type="button"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
          {!categories.length ? (
            <div className="empty-state">
              <Tag size={24} />
              <p>Nenhuma categoria cadastrada.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" onMouseDown={closeForm}>
          <section
            aria-labelledby="category-modal-title"
            aria-modal="true"
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal__header">
              <div>
                <p className="eyebrow">Catálogo</p>
                <h2 id="category-modal-title">
                  {editing ? "Editar categoria" : "Nova categoria"}
                </h2>
              </div>
              <button className="icon-button" onClick={closeForm} title="Fechar" type="button">
                <X size={19} />
              </button>
            </div>

            <form className="category-form" onSubmit={saveCategory}>
              <label>
                Nome
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex.: Restaurantes"
                  required
                  value={form.name}
                />
              </label>

              <label>
                Descrição
                <textarea
                  maxLength={1000}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Explique o que essa categoria reúne"
                  rows={3}
                  value={form.description}
                />
              </label>

              <div className="category-form__field">
                <span>Imagem da categoria</span>
                <div className="category-upload">
                  <span className="category-upload__preview">
                    {iconPreview ? <img alt="" src={iconPreview} /> : <ImageIcon size={23} />}
                  </span>
                  <div>
                    <strong>
                      {iconFile
                        ? iconFile.name
                        : editing?.iconUrl
                          ? "Imagem atual cadastrada"
                          : "Nenhuma imagem selecionada"}
                    </strong>
                    <small>Envie JPG, PNG, WEBP ou AVIF. A API converte para WEBP.</small>
                    <label className="button button--secondary category-upload__button">
                      <Upload size={16} />
                      Escolher imagem
                      <input accept="image/*" onChange={selectIcon} type="file" />
                    </label>
                  </div>
                </div>
              </div>

              <label>
                Status
                <select
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value }))
                  }
                  value={form.status}
                >
                  <option value="ATIVA">Ativa</option>
                  <option value="INATIVA">Inativa</option>
                </select>
              </label>

              {error ? <p className="form-error" role="alert">{error}</p> : null}

              <div className="modal__actions">
                <button className="button button--secondary" onClick={closeForm} type="button">
                  Cancelar
                </button>
                <button className="button button--primary" disabled={saving} type="submit">
                  {saving ? "Salvando..." : "Salvar categoria"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function resolveMediaUrl(value) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith("/uploads/")) {
    return `${apiBaseUrl}${value}`;
  }

  return value;
}
