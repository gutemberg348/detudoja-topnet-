import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Percent,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminEarningsSettings,
  getAdminSupportSettings,
  updateAdminSegmentFee,
  updateAdminSupportSettings,
} from "../services/admin.api";
import { PageLoading } from "../components/PageState";

const defaultForm = {
  message: "Ola, preciso de ajuda com minha conta no DeTudoJa.",
  whatsapp: "",
};

const commissionFields = [
  { icon: "cashback", key: "cashbackPercent", label: "Cashback", tone: "mint" },
  { icon: "rede", key: "networkPercent", label: "Rede qualificada", tone: "blue" },
  { icon: "direta", key: "sellerReferralPercent", label: "Indicacao do vendedor", tone: "violet" },
  { icon: "cliente", key: "consumerReferralPercent", label: "Indicacao do consumidor", tone: "amber" },
];

export function SettingsPage({ accessToken }) {
  const [activeSection, setActiveSection] = useState("earnings");
  const [error, setError] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSupport, setSavedSupport] = useState(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [segmentDrafts, setSegmentDrafts] = useState({});
  const [segments, setSegments] = useState([]);

  const loadSettings = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const [supportResponse, earningsResponse] = await Promise.all([
        getAdminSupportSettings(accessToken),
        getAdminEarningsSettings(accessToken),
      ]);
      const loadedSegments = earningsResponse.segments ?? [];

      setSavedSupport(supportResponse.support);
      setForm({
        message: supportResponse.support?.message || defaultForm.message,
        whatsapp: supportResponse.support?.whatsappDisplay || supportResponse.support?.whatsapp || "",
      });
      setSegments(loadedSegments);
      setSegmentDrafts(buildSegmentDrafts(loadedSegments));
      setSelectedSegmentId((current) => (
        loadedSegments.some((segment) => segment.id === current)
          ? current
          : loadedSegments[0]?.id ?? null
      ));
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar as configuracoes.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId],
  );
  const selectedDraft = selectedSegment ? segmentDrafts[selectedSegment.id] ?? {} : {};

  async function saveSupport(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const response = await updateAdminSupportSettings(accessToken, form);
      setSavedSupport(response.support);
      setForm({
        message: response.support.message,
        whatsapp: response.support.whatsappDisplay,
      });
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar o suporte.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSegment() {
    if (!selectedSegment) {
      return;
    }

    const commission = normalizeCommission(selectedDraft);

    setError("");
    setIsSaving(true);
    try {
      const response = await updateAdminSegmentFee(accessToken, selectedSegment.id, commission);
      setSegments((current) => current.map((segment) => (
        segment.id === selectedSegment.id ? response.segment : segment
      )));
      setSegmentDrafts((current) => ({
        ...current,
        [selectedSegment.id]: draftFromSegment(response.segment),
      }));
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar este segmento.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateSelectedDraft(key, value) {
    if (!selectedSegment) {
      return;
    }

    setSegmentDrafts((current) => ({
      ...current,
      [selectedSegment.id]: {
        ...current[selectedSegment.id],
        [key]: value,
      },
    }));
  }

  return (
    <div className="page-content settings-page">
      <header className="page-heading settings-page__heading">
        <div>
          <p className="eyebrow">Administracao</p>
          <h1>Configuracoes</h1>
          <p>Defina atendimento e regras de ganhos sem misturar operacao comercial.</p>
        </div>
        <button className="icon-button" disabled={isLoading} onClick={loadSettings} title="Atualizar configuracoes" type="button">
          <RefreshCw className={isLoading ? "spin" : ""} size={18} />
        </button>
      </header>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {isLoading ? <PageLoading label="Carregando configuracoes" /> : null}

      {!isLoading ? (
        <div className="settings-workspace">
          <aside className="settings-nav" aria-label="Secoes de configuracao">
            <button
              className={activeSection === "earnings" ? "settings-nav__item active" : "settings-nav__item"}
              onClick={() => setActiveSection("earnings")}
              type="button"
            >
              <span><Percent size={18} /></span>
              <div><strong>Ganhos</strong><small>Taxas por segmento</small></div>
            </button>
            <button
              className={activeSection === "support" ? "settings-nav__item active" : "settings-nav__item"}
              onClick={() => setActiveSection("support")}
              type="button"
            >
              <span><MessageCircle size={18} /></span>
              <div><strong>Suporte</strong><small>Canal no aplicativo</small></div>
            </button>
            <div className="settings-nav__note">
              <ShieldCheck size={17} />
              <span>As alteracoes sao salvas e usadas nas proximas vendas.</span>
            </div>
          </aside>

          {activeSection === "earnings" ? (
            <EarningsWorkspace
              draft={selectedDraft}
              isSaving={isSaving}
              onChange={updateSelectedDraft}
              onSave={saveSegment}
              onSelectSegment={setSelectedSegmentId}
              selectedSegment={selectedSegment}
              segments={segments}
            />
          ) : (
            <SupportWorkspace
              form={form}
              isSaving={isSaving}
              onChange={setForm}
              onSubmit={saveSupport}
              savedSupport={savedSupport}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function EarningsWorkspace({ draft, isSaving, onChange, onSave, onSelectSegment, selectedSegment, segments }) {
  const feePercent = Number(draft.feePercent ?? 0);
  const distributedPercent = commissionFields.reduce(
    (total, field) => total + Number(draft[field.key] ?? 0),
    0,
  );
  const companyPercent = feePercent - distributedPercent;

  return (
    <section className="settings-main">
      <header className="settings-main__header">
        <div>
          <p className="eyebrow">Ganhos da plataforma</p>
          <h2>Taxa por segmento</h2>
          <p>Cada segmento possui sua propria retencao e sua divisao. Categorias de loja nao definem taxa nesta tela.</p>
        </div>
        <span className="settings-main__count">{segments.length} segmentos</span>
      </header>

      {!segments.length ? (
        <div className="empty-state"><p>Nenhum segmento cadastrado ainda.</p></div>
      ) : (
        <div className="segment-workspace">
          <nav className="segment-list" aria-label="Segmentos de venda">
            {segments.map((segment) => (
              <button
                className={segment.id === selectedSegment?.id ? "segment-list__item active" : "segment-list__item"}
                key={segment.id}
                onClick={() => onSelectSegment(segment.id)}
                type="button"
              >
                <span className="segment-list__icon"><BriefcaseBusiness size={17} /></span>
                <span className="segment-list__copy">
                  <strong>{segment.name}</strong>
                  <small>{formatPercent(segment.commission?.feePercent ?? segment.feePercent)} de retencao</small>
                </span>
                <span className={segment.status === "ATIVO" ? "status-dot" : "status-dot is-inactive"} />
              </button>
            ))}
          </nav>

          {selectedSegment ? (
            <div className="segment-editor">
              <div className="segment-editor__heading">
                <div className="segment-editor__icon"><BriefcaseBusiness size={22} /></div>
                <div>
                  <p className="eyebrow">Segmento selecionado</p>
                  <h3>{selectedSegment.name}</h3>
                  <p>{selectedSegment.description || "Defina como a retencao desta venda sera distribuida."}</p>
                </div>
              </div>

              <label className="fee-total-field">
                <span>Retencao total da plataforma</span>
                <span className="input-suffix">
                  <input
                    max="100"
                    min="0"
                    onChange={(event) => onChange("feePercent", event.target.value)}
                    step="0.01"
                    type="number"
                    value={draft.feePercent ?? ""}
                  />
                  <b>%</b>
                </span>
                <small>Percentual retido sobre o valor bruto de cada venda deste segmento.</small>
              </label>

              <div className="commission-grid">
                {commissionFields.map((field) => (
                  <label className={`commission-field commission-field--${field.tone}`} key={field.key}>
                    <span className="commission-field__label">{field.label}</span>
                    <span className="input-suffix">
                      <input
                        max="100"
                        min="0"
                        onChange={(event) => onChange(field.key, event.target.value)}
                        step="0.01"
                        type="number"
                        value={draft[field.key] ?? ""}
                      />
                      <b>%</b>
                    </span>
                  </label>
                ))}
              </div>

              <div className={companyPercent < 0 ? "commission-summary is-invalid" : "commission-summary"}>
                <div>
                  <span>Dividido</span>
                  <strong>{formatPercent(distributedPercent)}</strong>
                </div>
                <div>
                  <span>Fica na empresa</span>
                  <strong>{formatPercent(companyPercent)}</strong>
                </div>
                <p>{companyPercent < 0 ? "A distribuicao nao pode passar da retencao total." : "O restante da retencao entra como receita da plataforma."}</p>
              </div>

              <div className="segment-editor__actions">
                <span><CheckCircle2 size={17} /> Validacao feita antes de salvar</span>
                <button className="button button--primary" disabled={isSaving || companyPercent < 0} onClick={onSave} type="button">
                  <Save size={17} />
                  {isSaving ? "Salvando..." : "Salvar segmento"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SupportWorkspace({ form, isSaving, onChange, onSubmit, savedSupport }) {
  return (
    <section className="settings-main">
      <header className="settings-main__header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h2>Suporte no aplicativo</h2>
          <p>O cliente usa este canal a partir do Perfil, sem precisar procurar um numero externo.</p>
        </div>
      </header>

      <div className="support-workspace">
        <form className="support-form" onSubmit={onSubmit}>
          <label>
            WhatsApp de suporte
            <span className="input-with-icon">
              <Phone size={18} />
              <input
                maxLength={20}
                onChange={(event) => onChange((current) => ({ ...current, whatsapp: event.target.value }))}
                placeholder="Ex.: (11) 99999-0000"
                required
                value={form.whatsapp}
              />
            </span>
          </label>
          <label>
            Mensagem inicial
            <textarea
              maxLength={240}
              onChange={(event) => onChange((current) => ({ ...current, message: event.target.value }))}
              placeholder="Mensagem que abrira no WhatsApp"
              rows={6}
              value={form.message}
            />
          </label>
          <button className="button button--primary" disabled={isSaving} type="submit">
            <Save size={17} />
            {isSaving ? "Salvando..." : "Salvar suporte"}
          </button>
        </form>

        <aside className="support-phone-preview">
          <div className="support-phone-preview__top"><MessageCircle size={18} /> Suporte DeTudoJa</div>
          <div className="support-phone-preview__bubble">
            <strong>Atendimento por WhatsApp</strong>
            <span>{savedSupport?.whatsappDisplay || form.whatsapp || "Numero nao configurado"}</span>
            <p>{form.message || defaultForm.message}</p>
          </div>
          {savedSupport?.whatsappUrl ? (
            <a className="button button--secondary" href={savedSupport.whatsappUrl} rel="noreferrer" target="_blank">
              <ExternalLink size={16} /> Testar link
            </a>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function buildSegmentDrafts(segments) {
  return segments.reduce((drafts, segment) => ({
    ...drafts,
    [segment.id]: draftFromSegment(segment),
  }), {});
}

function draftFromSegment(segment) {
  return {
    cashbackPercent: String(segment.commission?.cashbackPercent ?? 0),
    consumerReferralPercent: String(segment.commission?.consumerReferralPercent ?? 0),
    feePercent: String(segment.commission?.feePercent ?? segment.feePercent ?? 0),
    networkPercent: String(segment.commission?.networkPercent ?? 0),
    sellerReferralPercent: String(segment.commission?.sellerReferralPercent ?? 0),
  };
}

function normalizeCommission(draft) {
  return {
    cashbackPercent: Number(draft.cashbackPercent ?? 0),
    consumerReferralPercent: Number(draft.consumerReferralPercent ?? 0),
    feePercent: Number(draft.feePercent ?? 0),
    networkPercent: Number(draft.networkPercent ?? 0),
    sellerReferralPercent: Number(draft.sellerReferralPercent ?? 0),
  };
}

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
