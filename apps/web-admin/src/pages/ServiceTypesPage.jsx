import {
  Bike, BriefcaseBusiness, BusFront, Car, CircleUserRound, Edit3,
  GraduationCap, Hammer, HeartPulse, House, MapPin, MessageCircle,
  Monitor, Package, PawPrint, Plane, Plus, Scissors, Search, Ship,
  Sparkles, Store, Trash2, Truck, Utensils, Wrench, X, Zap,
} from "lucide-react";
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

const workflowOptions = [
  {
    description: "O cliente ve quem esta online, escolhe um profissional e abre o chat. Ideal para frete, manutencao e servicos comuns.",
    icon: CircleUserRound,
    label: "Cliente escolhe o profissional",
    value: "GERAL",
  },
  {
    description: "O cliente abre uma corrida, os profissionais online recebem o alerta e o primeiro aceite entra no chat. A loja tambem pode chamar a equipe ou a plataforma.",
    icon: Zap,
    label: "Chamada em tempo real",
    value: "ENTREGA_LOCAL",
  },
];

const serviceIcons = [
  ["bicycle", "Moto ou bicicleta", Bike],
  ["car", "Carro", Car],
  ["bus", "Passageiros", BusFront],
  ["truck", "Caminhao ou frete", Truck],
  ["cube", "Pacote ou entrega", Package],
  ["navigate", "Corrida ou rota", MapPin],
  ["construct", "Manutencao", Wrench],
  ["hammer", "Obra", Hammer],
  ["sparkles", "Limpeza", Sparkles],
  ["cut", "Beleza", Scissors],
  ["school", "Aulas", GraduationCap],
  ["home", "Casa", House],
  ["restaurant", "Alimentacao", Utensils],
  ["medical", "Saude", HeartPulse],
  ["paw", "Animais", PawPrint],
  ["desktop", "Tecnologia", Monitor],
  ["storefront", "Comercio", Store],
  ["boat", "Nautico", Ship],
  ["airplane", "Viagem", Plane],
  ["person", "Atendimento pessoal", CircleUserRound],
  ["briefcase", "Servico profissional", BriefcaseBusiness],
  ["flash", "Rapido ou urgente", Zap],
];

const servicePresets = [
  {
    description: "Entregas urbanas com chamada em tempo real.",
    iconName: "bicycle",
    label: "Motoboy",
    name: "Motoboy",
    operationalType: "ENTREGA_LOCAL",
    registrationRequirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["MOTO"] },
  },
  {
    description: "Corridas de passageiros por moto com aceite em tempo real.",
    iconName: "navigate",
    label: "Mototaxi",
    name: "Mototaxi",
    operationalType: "ENTREGA_LOCAL",
    registrationRequirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["MOTO"] },
  },
  {
    description: "Fretes e mudancas com escolha do profissional e negociacao pelo chat.",
    iconName: "truck",
    label: "Frete",
    name: "Frete",
    operationalType: "GERAL",
    registrationRequirements: { requiresDriverLicense: true, requiresPlate: true, requiresVehicle: true, vehicleKinds: ["CARRO", "UTILITARIO", "CAMINHAO"] },
  },
  {
    description: "Atendimento comum com escolha do prestador.",
    iconName: "briefcase",
    label: "Servico comum",
    name: "",
    operationalType: "GERAL",
    registrationRequirements: { requiresDriverLicense: false, requiresPlate: false, requiresVehicle: false, vehicleKinds: [] },
  },
];

function serviceIconComponent(iconName) {
  return serviceIcons.find(([value]) => value === iconName)?.[2] ?? BriefcaseBusiness;
}

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

  function applyPreset(preset) {
    setForm((current) => ({
      ...current,
      description: preset.description,
      iconName: preset.iconName,
      name: preset.name || current.name,
      operationalType: preset.operationalType,
      registrationRequirements: { ...preset.registrationRequirements },
    }));
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
              <span className="category-row__icon">{(() => { const Icon = serviceIconComponent(serviceType.iconName); return <Icon size={21} />; })()}</span>
              <div className="category-row__body">
                <div><h2>{serviceType.name}</h2><StatusBadge status={serviceType.status} /></div>
                <p>{serviceType.description || "Sem descricao"}</p>
                <small>
                  {serviceType.segment?.name ?? "Sem segmento"} - {modeCopy[serviceType.mode]} - {serviceType.providersCount} prestador(es)
                  {serviceType.operationalType === "ENTREGA_LOCAL" ? " - Chamada em tempo real com aceite" : " - Cliente escolhe o profissional"}
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
              <fieldset className="service-requirements service-presets">
                <legend>Comecar por um modelo</legend>
                <p>O modelo preenche a operacao e os documentos. Depois voce pode alterar qualquer opcao.</p>
                <div className="service-preset-grid">
                  {servicePresets.map((preset) => {
                    const Icon = serviceIconComponent(preset.iconName);
                    return <button className="service-preset" key={preset.label} onClick={() => applyPreset(preset)} type="button"><Icon size={19} /><span>{preset.label}</span></button>;
                  })}
                </div>
              </fieldset>
              <label>Nome<input autoFocus maxLength={120} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Frete" required value={form.name} /></label>
              <label>Descricao<textarea maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explique como o cliente solicita esse servico" rows={3} value={form.description} /></label>
              <label>Segmento financeiro<select onChange={(event) => setForm((current) => ({ ...current, segmentId: event.target.value }))} required value={form.segmentId}><option value="">Selecione o segmento dos ganhos</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
              <label>Modo de atendimento<select onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))} value={form.mode}><option value="NEGOCIACAO_CHAT">Negociacao por chat</option><option value="PRECO_FIXO">Preco fixo</option></select></label>
              <fieldset className="service-requirements service-workflow">
                <legend>Como o cliente solicita</legend>
                <p>Esta escolha controla as telas do aplicativo, os alertas e a forma de aceite. Nao depende do nome do servico.</p>
                <div className="service-workflow-grid">
                  {workflowOptions.map((option) => {
                    const Icon = option.icon;
                    const active = form.operationalType === option.value;
                    return <label className={`service-workflow-card${active ? " service-workflow-card--active" : ""}`} key={option.value}><input checked={active} name="operationalType" onChange={() => setForm((current) => ({ ...current, operationalType: option.value }))} type="radio" value={option.value} /><span className="service-workflow-card__icon"><Icon size={20} /></span><span><strong>{option.label}</strong><small>{option.description}</small></span></label>;
                  })}
                </div>
                {form.operationalType === "ENTREGA_LOCAL" ? <div className="service-flow-summary"><Zap size={16} /><span><strong>Fluxo completo de corrida:</strong> cliente chama, profissional recebe alerta e aceita; lojas podem chamar a equipe ou abrir para a plataforma.</span></div> : null}
              </fieldset>
              <fieldset className="service-requirements">
                <legend>Cadastro exigido do prestador</legend>
                <p>Defina o que o app deve pedir antes de mostrar o interruptor deste servico.</p>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresVehicle} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresVehicle: event.target.checked } }))} type="checkbox" /><span><strong>Exigir veiculo</strong><small>Pede tipo, modelo e cor.</small></span></label>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresDriverLicense} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresDriverLicense: event.target.checked } }))} type="checkbox" /><span><strong>Exigir CNH</strong><small>Obrigatoria antes de ativar o servico.</small></span></label>
                <label className="service-requirements__toggle"><input checked={form.registrationRequirements.requiresPlate} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, requiresPlate: event.target.checked } }))} type="checkbox" /><span><strong>Exigir placa</strong><small>Valida o padrao brasileiro ou Mercosul.</small></span></label>
                {form.registrationRequirements.requiresVehicle ? <div className="service-vehicle-kinds"><span>Veiculos aceitos</span>{[["MOTO", "Moto"], ["CARRO", "Carro"], ["UTILITARIO", "Utilitario/van"], ["CAMINHAO", "Caminhao"], ["BICICLETA", "Bicicleta"]].map(([value, label]) => <label key={value}><input checked={form.registrationRequirements.vehicleKinds.includes(value)} onChange={(event) => setForm((current) => ({ ...current, registrationRequirements: { ...current.registrationRequirements, vehicleKinds: event.target.checked ? [...current.registrationRequirements.vehicleKinds, value] : current.registrationRequirements.vehicleKinds.filter((item) => item !== value) } }))} type="checkbox" />{label}</label>)}</div> : null}
              </fieldset>
              <fieldset className="service-requirements service-icon-picker">
                <legend>Icone do servico</legend>
                <p>Escolha visualmente. O mesmo icone sera usado no painel e no aplicativo.</p>
                <div className="service-icon-grid">
                  {serviceIcons.map(([value, label, Icon]) => <button aria-label={label} className={`service-icon-option${form.iconName === value ? " service-icon-option--active" : ""}`} key={value} onClick={() => setForm((current) => ({ ...current, iconName: value }))} title={label} type="button"><Icon size={20} /><span>{label}</span></button>)}
                </div>
              </fieldset>
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
