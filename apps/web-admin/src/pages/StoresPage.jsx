import {
  Ban,
  Edit3,
  Eye,
  EyeOff,
  PauseCircle,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import {
  deleteAdminStore,
  getAdminCategories,
  getAdminSegments,
  getAdminStores,
  updateAdminStore,
} from "../services/admin.api";

const emptyFilters = {
  categoryId: "",
  search: "",
  status: "",
  visibility: "",
};

const emptyForm = {
  acceptsOnlinePayment: false,
  acceptsQrCode: false,
  categoryId: "",
  customFeeEnabled: false,
  customFeePercent: "",
  description: "",
  email: "",
  merchantKycStatus: "APROVADO",
  merchantMonthlySalesLimit: "",
  merchantStatus: "ATIVO",
  localPriorityCashbackLimit: "",
  localProcessingFee: "",
  name: "",
  onlineServiceFee: "",
  ownerEmail: "",
  ownerName: "",
  ownerPhone: "",
  phone: "",
  segmentId: "",
  status: "ATIVA",
  visibleInApp: true,
  whatsapp: "",
};

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })}%`;
}

function formatMoney(value) {
  if (value == null) return "Sem limite";
  return (Number(value) / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function moneyToCents(value) {
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function centsToMoneyInput(value) {
  if (value == null) return "";
  return (Number(value) / 100).toFixed(2).replace(".", ",");
}

export function StoresPage({ accessToken }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState([]);
  const [stores, setStores] = useState(null);

  const loadStores = useCallback(async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await getAdminStores(accessToken, filters);
      setStores(response.stores ?? []);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar as lojas.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, filters]);

  const loadCategories = useCallback(async () => {
    try {
      const [categoryResponse, segmentResponse] = await Promise.all([
        getAdminCategories(accessToken),
        getAdminSegments(accessToken),
      ]);
      setCategories(categoryResponse.categories ?? []);
      setSegments(segmentResponse.segments ?? []);
    } catch {
      setCategories([]);
      setSegments([]);
    }
  }, [accessToken]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(loadStores, 250);
    return () => clearTimeout(timer);
  }, [loadStores]);

  function openEdit(store) {
    setEditing(store);
    setForm({
      acceptsOnlinePayment: store.acceptsOnlinePayment,
      acceptsQrCode: store.acceptsQrCode,
      categoryId: String(store.categoryId ?? ""),
      customFeeEnabled: store.fee?.hasCustom ?? false,
      customFeePercent: store.fee?.customPercent ?? "",
      description: store.description ?? "",
      email: store.email ?? "",
      merchantKycStatus: store.merchant?.kycStatus ?? "APROVADO",
      merchantMonthlySalesLimit: centsToMoneyInput(store.merchant?.monthlySalesLimitCents),
      merchantStatus: store.merchant?.status ?? "ATIVO",
      localPriorityCashbackLimit: centsToMoneyInput(
        store.paymentPolicyOverrides?.localPriorityCashbackLimitCents,
      ),
      localProcessingFee: centsToMoneyInput(
        store.paymentPolicyOverrides?.localProcessingFeeCents,
      ),
      name: store.name ?? "",
      onlineServiceFee: centsToMoneyInput(
        store.paymentPolicyOverrides?.onlineServiceFeeCents,
      ),
      ownerEmail: store.merchant?.user?.email ?? "",
      ownerName: store.merchant?.user?.name ?? "",
      ownerPhone: store.merchant?.user?.phone ?? "",
      phone: store.phone ?? "",
      segmentId: String(store.segmentId ?? ""),
      status: store.status ?? "ATIVA",
      visibleInApp: store.visibleInApp,
      whatsapp: store.whatsapp ?? "",
    });
    setError("");
    setModalOpen(true);
  }

  function closeEdit() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(false);
  }

  async function saveStore(event) {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setError("");

    try {
      await updateAdminStore(accessToken, editing.id, {
        acceptsOnlinePayment: form.acceptsOnlinePayment,
        acceptsQrCode: form.acceptsQrCode,
        categoryId: Number(form.categoryId),
        customFeePercent: form.customFeeEnabled ? Number(form.customFeePercent || 0) : null,
        description: form.description,
        email: form.email,
        merchantKycStatus: form.merchantKycStatus,
        merchantMonthlySalesLimitCents: form.merchantMonthlySalesLimit
          ? moneyToCents(form.merchantMonthlySalesLimit)
          : null,
        merchantStatus: form.merchantStatus,
        localPriorityCashbackLimitCents: form.localPriorityCashbackLimit
          ? moneyToCents(form.localPriorityCashbackLimit)
          : null,
        localProcessingFeeCents: form.localProcessingFee
          ? moneyToCents(form.localProcessingFee)
          : null,
        name: form.name,
        onlineServiceFeeCents: form.onlineServiceFee
          ? moneyToCents(form.onlineServiceFee)
          : null,
        ownerEmail: form.ownerEmail,
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone,
        phone: form.phone,
        segmentId: Number(form.segmentId),
        status: form.status,
        visibleInApp: form.visibleInApp,
        whatsapp: form.whatsapp,
      });
      closeEdit();
      await loadStores();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar a loja.");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(store, payload) {
    setError("");
    try {
      await updateAdminStore(accessToken, store.id, payload);
      await loadStores();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel atualizar a loja.");
    }
  }

  async function removeStore(store) {
    if (!window.confirm(`Excluir a loja ${store.name}? Ela saira do app e ficara preservada apenas no historico.`)) {
      return;
    }

    setError("");
    try {
      await deleteAdminStore(accessToken, store.id);
      await loadStores();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel excluir a loja.");
    }
  }

  const availableSegments = segments.filter(
    (segment) => String(segment.categoryId) === String(form.categoryId),
  );
  const selectedSegment = segments.find(
    (segment) => String(segment.id) === String(form.segmentId),
  );

  return (
    <div className="page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Comercio</p>
          <h1>Lojas</h1>
          <p>Gerencie lojas, lojistas, visibilidade, status e taxa personalizada.</p>
        </div>
      </header>

      <section className="toolbar toolbar--stores">
        <label className="search-field">
          <Search size={18} />
          <input
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Buscar loja, dono, e-mail ou telefone"
            value={filters.search}
          />
        </label>
        <select
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
          value={filters.status}
        >
          <option value="">Todos status</option>
          <option value="ATIVA">Ativas</option>
          <option value="PAUSADA">Pausadas</option>
          <option value="BLOQUEADA">Bloqueadas</option>
          <option value="EM_ANALISE">Em analise</option>
        </select>
        <select
          onChange={(event) =>
            setFilters((current) => ({ ...current, visibility: event.target.value }))
          }
          value={filters.visibility}
        >
          <option value="">Toda visibilidade</option>
          <option value="visible">Visiveis no app</option>
          <option value="hidden">Ocultas</option>
        </select>
        <select
          onChange={(event) =>
            setFilters((current) => ({ ...current, categoryId: event.target.value }))
          }
          value={filters.categoryId}
        >
          <option value="">Todas categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </section>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {isLoading ? <PageLoading label="Carregando lojas" /> : null}

      {!isLoading && stores ? (
        <section className="data-section data-section--flush">
          <div className="table-scroll">
            <table className="stores-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Dono</th>
                  <th>Status</th>
                  <th>Taxa</th>
                  <th>Catalogo</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td>
                      <div className="store-identity">
                        <span className="store-identity__icon"><Store size={18} /></span>
                        <div>
                          <strong>{store.name}</strong>
                          <small>{store.category?.name ?? "Sem categoria"} - #{store.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="table-primary">{store.merchant?.user?.name ?? "Sem dono"}</span>
                      <span className="table-secondary">{store.merchant?.user?.email ?? store.email ?? "-"}</span>
                    </td>
                    <td>
                      <StatusBadge status={store.status} />
                      <span className="table-secondary">
                        {store.visibleInApp ? "Visivel no app" : "Oculta no app"}
                      </span>
                    </td>
                    <td>
                      <span className="table-primary">
                        {formatPercent(store.fee?.effectivePercent)}
                      </span>
                      <span className="table-secondary">
                        {store.fee?.hasCustom ? "Personalizada" : "Herdada da categoria"}
                      </span>
                    </td>
                    <td>
                      <span className="table-primary">{store.productsCount} produtos</span>
                      <span className="table-secondary">{store.ordersCount} pedidos</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="icon-button" onClick={() => openEdit(store)} title="Editar loja" type="button">
                          <Edit3 size={17} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => quickUpdate(store, { status: "ATIVA", visibleInApp: true })}
                          title="Ativar e exibir"
                          type="button"
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => quickUpdate(store, { status: "PAUSADA", visibleInApp: false })}
                          title="Pausar e ocultar"
                          type="button"
                        >
                          <PauseCircle size={17} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => quickUpdate(store, { status: "BLOQUEADA", visibleInApp: false })}
                          title="Bloquear"
                          type="button"
                        >
                          <Ban size={17} />
                        </button>
                        <button className="icon-button icon-button--danger" onClick={() => removeStore(store)} title="Excluir loja" type="button">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stores.length ? (
              <div className="empty-state">
                <Store size={24} />
                <p>Nenhuma loja encontrada.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" onMouseDown={closeEdit}>
          <section
            aria-labelledby="store-modal-title"
            aria-modal="true"
            className="modal modal--wide"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal__header">
              <div>
                <p className="eyebrow">Loja</p>
                <h2 id="store-modal-title">{editing?.name}</h2>
              </div>
              <button className="icon-button" onClick={closeEdit} title="Fechar" type="button">
                <X size={19} />
              </button>
            </div>

            <form className="category-form store-form" onSubmit={saveStore}>
              <div className="form-grid form-grid--two">
                <label>
                  Nome da loja
                  <input
                    maxLength={180}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={form.name}
                  />
                </label>
                <label>
                  Categoria
                  <select
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                      segmentId: "",
                    }))}
                    required
                    value={form.categoryId}
                  >
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Segmento
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, segmentId: event.target.value }))}
                    required
                    value={form.segmentId}
                  >
                    <option value="">Selecione</option>
                    {availableSegments.map((segment) => (
                      <option key={segment.id} value={segment.id}>{segment.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Descricao
                <textarea
                  maxLength={2000}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  value={form.description}
                />
              </label>

              <div className="form-grid form-grid--three">
                <label>
                  Responsavel
                  <input
                    maxLength={160}
                    onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                    required
                    value={form.ownerName}
                  />
                </label>
                <label>
                  E-mail do responsavel
                  <input
                    maxLength={255}
                    onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                    required
                    type="email"
                    value={form.ownerEmail}
                  />
                </label>
                <label>
                  Telefone do responsavel
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, ownerPhone: event.target.value }))}
                    value={form.ownerPhone}
                  />
                </label>
              </div>

              <div className="form-grid form-grid--three">
                <label>
                  Status da loja
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option value="ATIVA">Ativa</option>
                    <option value="PAUSADA">Pausada</option>
                    <option value="BLOQUEADA">Bloqueada</option>
                    <option value="EM_ANALISE">Em analise</option>
                    <option value="REPROVADA">Reprovada</option>
                    <option value="RASCUNHO">Rascunho</option>
                  </select>
                </label>
                <label>
                  Status lojista
                  <select onChange={(event) => setForm((current) => ({ ...current, merchantStatus: event.target.value }))} value={form.merchantStatus}>
                    <option value="ATIVO">Ativo</option>
                    <option value="PAUSADO">Pausado</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                    <option value="PENDENTE">Pendente</option>
                    <option value="REPROVADO">Reprovado</option>
                  </select>
                </label>
                <label>
                  KYC lojista
                  <select onChange={(event) => setForm((current) => ({ ...current, merchantKycStatus: event.target.value }))} value={form.merchantKycStatus}>
                    <option value="APROVADO">Aprovado</option>
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANALISE">Em analise</option>
                    <option value="REPROVADO">Reprovado</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                  </select>
                </label>
              </div>

              <div className="form-grid form-grid--three">
                <label>
                  Telefone
                  <input onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} value={form.phone} />
                </label>
                <label>
                  WhatsApp
                  <input onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} value={form.whatsapp} />
                </label>
                <label>
                  E-mail
                  <input onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" value={form.email} />
                </label>
              </div>

              <div className="toggle-grid">
                <label className="toggle-card">
                  <input
                    checked={form.visibleInApp}
                    onChange={(event) => setForm((current) => ({ ...current, visibleInApp: event.target.checked }))}
                    type="checkbox"
                  />
                  <span><EyeOff size={17} /> Visivel no app</span>
                </label>
                <label className="toggle-card">
                  <input
                    checked={form.acceptsQrCode}
                    onChange={(event) => setForm((current) => ({ ...current, acceptsQrCode: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>QR presencial</span>
                </label>
                <label className="toggle-card">
                  <input
                    checked={form.acceptsOnlinePayment}
                    onChange={(event) => setForm((current) => ({ ...current, acceptsOnlinePayment: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Venda online</span>
                </label>
              </div>

              <div className="fee-editor">
                <div>
                  <p className="eyebrow">Ganhos</p>
                  <strong>Taxa da loja</strong>
                  <span>Segmento atual cobra {formatPercent(selectedSegment?.feePercent ?? 0)} e usa {selectedSegment?.orderFlow === "CHAT_NEGOTIATION" ? "negociacao por chat" : "checkout direto"}. Use taxa personalizada so quando o admin negociar algo diferente.</span>
                </div>
                <label className="toggle-card">
                  <input
                    checked={form.customFeeEnabled}
                    onChange={(event) => setForm((current) => ({ ...current, customFeeEnabled: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Usar taxa personalizada</span>
                </label>
                {form.customFeeEnabled ? (
                  <label>
                    Taxa personalizada (%)
                    <input
                      max="100"
                      min="0"
                      onChange={(event) => setForm((current) => ({ ...current, customFeePercent: event.target.value }))}
                      step="0.0001"
                      type="number"
                      value={form.customFeePercent}
                    />
                  </label>
                ) : null}
              </div>

              <div className="fee-editor">
                <div>
                  <p className="eyebrow">Excecoes financeiras</p>
                  <strong>Politica desta loja</strong>
                  <span>Deixe vazio para herdar o segmento. O segmento vazio herda a configuracao global.</span>
                </div>
                <div className="form-grid form-grid--three">
                  <label>
                    Taxa de servico online (R$)
                    <input
                      min="0"
                      onChange={(event) => setForm((current) => ({ ...current, onlineServiceFee: event.target.value }))}
                      placeholder={centsToMoneyInput(editing?.paymentPolicy?.onlineServiceFeeCents) || "0,99"}
                      step="0.01"
                      type="text"
                      value={form.onlineServiceFee}
                    />
                    <small>Efetiva agora: {formatMoney(editing?.paymentPolicy?.onlineServiceFeeCents)}.</small>
                  </label>
                  <label>
                    Processamento local (R$)
                    <input
                      min="0"
                      onChange={(event) => setForm((current) => ({ ...current, localProcessingFee: event.target.value }))}
                      placeholder={centsToMoneyInput(editing?.paymentPolicy?.localProcessingFeeCents) || "0,99"}
                      step="0.01"
                      type="text"
                      value={form.localProcessingFee}
                    />
                    <small>Efetivo agora: {formatMoney(editing?.paymentPolicy?.localProcessingFeeCents)}.</small>
                  </label>
                  <label>
                    Cashback prioritario (R$)
                    <input
                      min="0"
                      onChange={(event) => setForm((current) => ({ ...current, localPriorityCashbackLimit: event.target.value }))}
                      placeholder={centsToMoneyInput(editing?.paymentPolicy?.localPriorityCashbackLimitCents) || "1,00"}
                      step="0.01"
                      type="text"
                      value={form.localPriorityCashbackLimit}
                    />
                    <small>Efetivo agora: {formatMoney(editing?.paymentPolicy?.localPriorityCashbackLimitCents)}.</small>
                  </label>
                </div>
              </div>

              <label>
                Limite mensal do lojista por CPF
                <input
                  onChange={(event) => setForm((current) => ({ ...current, merchantMonthlySalesLimit: event.target.value }))}
                  placeholder="Ex.: 5000,00. Vazio = sem limite"
                  value={form.merchantMonthlySalesLimit}
                />
                <small>Atual: {formatMoney(editing?.merchant?.monthlySalesLimitCents)}</small>
              </label>

              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="modal__actions">
                <button className="button button--secondary" onClick={closeEdit} type="button">Cancelar</button>
                <button className="button button--primary" disabled={saving} type="submit">
                  {saving ? "Salvando..." : "Salvar loja"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
