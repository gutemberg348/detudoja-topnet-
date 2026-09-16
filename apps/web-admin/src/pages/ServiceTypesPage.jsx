import { Edit3, MessageCircle, Plus, Search, Truck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import {
  createAdminServiceType,
  deleteAdminServiceType,
  getAdminSegments,
  getAdminServiceTypes,
  updateAdminServiceType,
} from "../services/admin.api";

const emptyForm = {
  description: "",
  iconName: "",
  mode: "NEGOCIACAO_CHAT",
  name: "",
  operationalType: "GERAL",
  registrationRequirements: {
    requiresDriverLicense: false,
    requiresPlate: false,
    requiresVehicle: false,
    vehicleKinds: [],
  },
  segmentId: "",
  sortOrder: 0,
  status: "ATIVO",
};

const modeCopy = {
  NEGOCIACAO_CHAT: "Negociacao por chat",
  PRECO_FIXO: "Preco fixo",
};

export function ServiceTypesPage({ accessToken }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [segments, setSegments] = useState([]);
  const [serviceTypes, setServiceTypes] = useState(null);

  const loadServiceTypes = useCallback(async () => {
    setError("");
    try {
      const response = await getAdminServiceTypes(accessToken, { search });
      setServiceTypes(response.serviceTypes ?? []);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar os servicos.");
    }
  }, [accessToken, search]);

  useEffect(() => {
    const timer = setTimeout(loadServiceTypes, 220);
    return () => clearTimeout(timer);
  }, [loadServiceTypes]);

  useEffect(() => {
    getAdminSegments(accessToken)
      .then((response) => setSegments((response.segments ?? []).filter((segment) => segment.status === "ATIVO")))
      .catch(() => setSegments([]));
  }, [accessToken]);

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(false);
  }

  function openForm(serviceType = null) {
    setEditing(serviceType);
    setForm(serviceType ? {
      description: serviceType.description ?? "",
      iconName: serviceType.iconName ?? "",
      mode: serviceType.mode,
      name: serviceType.name,
      operationalType: serviceType.operationalType ?? "GERAL",
      registrationRequirements: serviceType.registrationRequirements ?? emptyForm.registrationRequirements,
      segmentId: String(serviceType.segmentId ?? ""),
      sortOrder: serviceType.sortOrder ?? 0,
      status: serviceType.status,
    } : emptyForm);
    setError("");
    setModalOpen(true);
  }

  async function saveServiceType(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) await updateAdminServiceType(accessToken, editing.id, form);
      else await createAdminServiceType(accessToken, form);
      closeForm();
      await loadServiceTypes();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar o servico.");
    } finally {
      setSaving(false);
    }
  }

  async function removeServiceType(serviceType) {
    if (!window.confirm(`Desativar o servico ${serviceType.name}?`)) return;
    setError("");
    try {
      await deleteAdminServiceType(accessToken, serviceType.id);
      await loadServiceTypes();
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel desativar o servico.");
    }
  }

  return (
    <div className="page-content">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">Prestadores e busca</p>
          <h1>Servicos</h1>
          <p>Defina o que o prestador pode ativar e como cada servico atende.</p>
        </div>
        <button className="button button--primary" onClick={() => openForm()} type="button">
          <Plus size={18} />Novo servico
        </button>
      </header>

      <section className="toolbar toolbar--categories">
        <label className="search-field">
          <Search size={18} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar servico" value={search} />
        </label>
      </section>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {!serviceTypes ? <PageLoading label="Carregando servicos" /> : null}
      {serviceTypes ? (
        <section className="category-list" aria-label="Servicos cadastrados">
          {serviceTypes.map((serviceType) => (
            <article className="category-row" key={serviceType.id}>
              <span className="category-row__icon"><Truck size={21} /></span>
              <div className="category-row__body">
                <div><h2>{serviceType.name}</h2><StatusBadge status={serviceType.status} /></div>
                <p>{serviceType.description || "Sem descricao"}</p>
                <small>
                  {serviceType.segment?.name ?? "Sem segmento"} - {modeCopy[serviceType.mode]} - {serviceType.providersCount} prestador(es)
                  {serviceType.operationalType === "ENTREGA_LOCAL" ? " - Exige cadastro de motoboy e aceita chamadas de lojas" : ""}
                </small>
                {serviceType.registrationRequirements?.requiresVehicle || serviceType.registrationRequirements?.requiresDriverLicense || serviceType.registrationRequirements?.requiresPlate ? (
                  <small className="service-requirements-summary">
                    Cadastro exigido: {serviceType.registrationRequirements.requiresVehicle ? serviceType.registrationRequirements.vehicleKinds?.join(", ") || "veiculo" : "dados profissionais"}
                    {serviceType.registrationRequirements.requiresDriverLicense ? " + CNH" : ""}
                    {serviceType.registrationRequirements.requiresPlate ? " + placa" : ""}
                  </small>
                ) : null}
              </div>
              <div className="category-row__actions">
                <button className="icon-button" onClick={() => openForm(serviceType)} title="Editar servico" type="button"><Edit3 size={18} /></button>
                <button className="icon-button icon-button--danger" onClick={() => removeServiceType(serviceType)} title="Desativar servico" type="button"><Trash2 size={18} /></button>
              </div>
            </article>
          ))}
          {!serviceTypes.length ? <div className="empty-state"><MessageCircle size={24} /><p>Nenhum servico cadastrado.</p></div> : null}
        </section>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" onMouseDown={closeForm}>
          <section aria-labelledby="service-type-modal-title" aria-modal="true" className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <div className="modal__header">
              <div><p className="eyebrow">Prestadores</p><h2 id="service-type-modal-title">{editing ? "Editar servico" : "Novo servico"}</h2></div>
              <button className="icon-button" onClick={closeForm} title="Fechar" type="button"><X size={19} /></button>
            </div>
            <form className="category-form" onSubmit={saveServiceType}>
              <label>Nome<input autoFocus maxLength={120} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Frete" required value={form.name} /></label>
              <label>Descricao<textarea maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explique como o cliente solicita esse servico" rows={3} value={form.description} /></label>
              <label>Segmento financeiro<select onChange={(event) => setForm((current) => ({ ...current, segmentId: event.target.value }))} required value={form.segmentId}><option value="">Selecione o segmento dos ganhos</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
              <label>Modo de atendimento<select onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))} value={form.mode}><option value="NEGOCIACAO_CHAT">Negociacao por chat</option><option value="PRECO_FIXO">Preco fixo</option></select></label>
              <label>Uso operacional<select onChange={(event) => setForm((current) => ({ ...current, operationalType: event.target.value }))} value={form.operationalType}><option value="GERAL">Servico geral para clientes</option><option value="ENTREGA_LOCAL">Entrega local com cadastro de motoboy</option></select></label>
              <fieldset className="service-requirements">
                <legend>Cadastro exigido do prestador</legend>
                <p>Defina o que o app deve pedir antes de mostrar o interruptor deste servico.</p>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresVehicle} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresVehicle: event.target.checked } }))} type="checkbox" /><span><strong>Exigir veiculo</strong><small>Pede tipo, modelo e cor.</small></span></label>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresDriverLicense} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresDriverLicense: event.target.checked } }))} type="checkbox" /><span><strong>Exigir CNH</strong><small>Obrigatoria antes de ativar o servico.</small></span></label>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresPlate} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresPlate: event.target.checked } }))} type="checkbox" /><span><strong>Exigir placa</strong><small>Valida o padrao brasileiro ou Mercosul.</small></span></label>
                {form.registrationRequirements.requiresVehicle ? <div className="service-vehicle-kinds"><span>Veiculos aceitos</span>{[["MOTO", "Moto"], ["CARRO", "Carro"], ["UTILITARIO", "Utilitario/van"], ["CAMINHAO", "Caminhao"], ["BICICLETA", "Bicicleta"]].map(([value, label]) => <label key={value}><input checked={form.registrationRequirements.vehicleKinds.includes(value)} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, vehicleKinds: event.target.checked ? [...current.registrationRequirements.vehicleKinds, value] : current.registrationRequirements.vehicleKinds.filter((item) => item !== value) } }))} type="checkbox" />{label}</label>)}</div> : null}
              </fieldset>
              <label>Icone<input maxLength={80} onChange={(event) => setForm((current) => ({ ...current, iconName: event.target.value }))} placeholder="Ex.: bicycle" value={form.iconName} /></label>
              <label>Ordem<input min={0} onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={form.sortOrder} /></label>
              <label>Status<select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="INATIVO">Inativo</option></select></label>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="modal__actions"><button className="button button--secondary" onClick={closeForm} type="button">Cancelar</button><button className="button button--primary" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar servico"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
