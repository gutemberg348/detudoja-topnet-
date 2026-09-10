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
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminEarningsSettings,
  getAdminSupportSettings,
  getAdminWithdrawalSettings,
  updateAdminSegmentFee,
  updateAdminPaymentPolicy,
  updateAdminSupportSettings,
  updateAdminWithdrawalSettings,
} from "../services/admin.api";
import { PageLoading } from "../components/PageState";

const defaultForm = {
  message: "Ola, preciso de ajuda com minha conta no Brasil Cashback.",
  whatsapp: "",
};

const defaultWithdrawalForm = {
  dailyLimitCents: 500000,
  enabled: true,
  fixedFeeCents: 0,
  manualApproval: true,
  maximumCents: 500000,
  minimumCents: 1000,
};

const defaultPaymentPolicy = {
  localPriorityCashbackLimitCents: 100,
  localProcessingFeeCents: 99,
  onlineServiceFeeCents: 99,
};

const commissionFields = [
  { icon: "cashback", key: "cashbackPercent", label: "Cashback", tone: "mint" },
  { icon: "rede", key: "networkPercent", label: "Rede qualificada", tone: "blue" },
  { icon: "direta", key: "sellerReferralPercent", label: "Indicacao do vendedor", tone: "violet" },
  { icon: "cliente", key: "consumerReferralPercent", label: "Indicacao do consumidor", tone: "amber" },
];

const paymentPolicyFields = [
  { key: "onlineServiceFeeCents", label: "Taxa de servico online", note: "Cobrada em pedidos com entrega ou retirada." },
  { key: "localProcessingFeeCents", label: "Processamento local", note: "Primeira parcela retirada da comissao presencial." },
  { key: "localPriorityCashbackLimitCents", label: "Cashback prioritario", note: "Valor preenchido antes de iniciar o pool local." },
];

export function SettingsPage({
  accessToken,
  canManageEarnings = false,
  canManageSupport = false,
  canManageWithdrawals = false,
}) {
  const [activeSection, setActiveSection] = useState(
    canManageEarnings ? "earnings" : "support",
  );
  const [error, setError] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSupport, setSavedSupport] = useState(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [segmentDrafts, setSegmentDrafts] = useState({});
  const [segments, setSegments] = useState([]);
  const [paymentPolicy, setPaymentPolicy] = useState(defaultPaymentPolicy);
  const [withdrawalForm, setWithdrawalForm] = useState(defaultWithdrawalForm);

  const loadSettings = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const [supportResponse, earningsResponse, withdrawalResponse] = await Promise.all([
        canManageSupport ? getAdminSupportSettings(accessToken) : Promise.resolve(null),
        canManageEarnings ? getAdminEarningsSettings(accessToken) : Promise.resolve(null),
        canManageWithdrawals ? getAdminWithdrawalSettings(accessToken) : Promise.resolve(null),
      ]);
      const loadedSegments = earningsResponse?.segments ?? [];

      if (supportResponse) {
        setSavedSupport(supportResponse.support);
        setForm({
          message: supportResponse.support?.message || defaultForm.message,
          whatsapp: supportResponse.support?.whatsappDisplay || supportResponse.support?.whatsapp || "",
        });
      }
      if (earningsResponse) {
        setPaymentPolicy(earningsResponse.paymentPolicy ?? defaultPaymentPolicy);
        setSegments(loadedSegments);
        setSegmentDrafts(buildSegmentDrafts(loadedSegments));
        setSelectedSegmentId((current) => (
          loadedSegments.some((segment) => segment.id === current)
            ? current
            : loadedSegments[0]?.id ?? null
        ));
      }
      if (withdrawalResponse?.settings) {
        setWithdrawalForm(withdrawalResponse.settings);
      }
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel carregar as configuracoes.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canManageEarnings, canManageSupport, canManageWithdrawals]);

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

  async function savePaymentPolicy(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const response = await updateAdminPaymentPolicy(accessToken, paymentPolicy);
      setPaymentPolicy(response.paymentPolicy);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar a politica de pagamentos.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveWithdrawals(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const response = await updateAdminWithdrawalSettings(accessToken, withdrawalForm);
      setWithdrawalForm(response.settings);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel salvar as regras de saque.");
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
            {canManageEarnings ? <button
              className={activeSection === "earnings" ? "settings-nav__item active" : "settings-nav__item"}
              onClick={() => setActiveSection("earnings")}
              type="button"
            >
              <span><Percent size={18} /></span>
              <div><strong>Ganhos</strong><small>Taxas por segmento</small></div>
            </button> : null}
            {canManageSupport ? <button
              className={activeSection === "support" ? "settings-nav__item active" : "settings-nav__item"}
              onClick={() => setActiveSection("support")}
              type="button"
            >
              <span><MessageCircle size={18} /></span>
              <div><strong>Suporte</strong><small>Canal no aplicativo</small></div>
            </button> : null}
            {canManageWithdrawals ? <button
              className={activeSection === "withdrawals" ? "settings-nav__item active" : "settings-nav__item"}
              onClick={() => setActiveSection("withdrawals")}
              type="button"
            >
              <span><WalletCards size={18} /></span>
              <div><strong>Saques</strong><small>Taxa e limites Pix</small></div>
            </button> : null}
            <div className="settings-nav__note">
              <ShieldCheck size={17} />
              <span>As alteracoes sao salvas e usadas nas proximas vendas.</span>
            </div>
          </aside>

          {activeSection === "earnings" && canManageEarnings ? (
            <EarningsWorkspace
              draft={selectedDraft}
              isSaving={isSaving}
              onChange={updateSelectedDraft}
              onPaymentPolicyChange={setPaymentPolicy}
              onPaymentPolicySave={savePaymentPolicy}
              onSave={saveSegment}
              onSelectSegment={setSelectedSegmentId}
              selectedSegment={selectedSegment}
              segments={segments}
              paymentPolicy={paymentPolicy}
            />
          ) : activeSection === "withdrawals" && canManageWithdrawals ? (
            <WithdrawalsWorkspace
              form={withdrawalForm}
              isSaving={isSaving}
              onChange={setWithdrawalForm}
              onSubmit={saveWithdrawals}
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

function WithdrawalsWorkspace({ form, isSaving, onChange, onSubmit }) {
  const fields = [
    { key: "fixedFeeCents", label: "Taxa fixa", note: "Retida somente quando o Pix for confirmado." },
    { key: "minimumCents", label: "Saque minimo", note: "Menor valor bruto permitido por solicitacao." },
    { key: "maximumCents", label: "Saque maximo", note: "Maior valor bruto permitido por solicitacao." },
    { key: "dailyLimitCents", label: "Limite diario", note: "Soma maxima reservada por usuario a cada dia." },
  ];

  return (
    <section className="settings-main">
      <header className="settings-main__header">
        <div>
          <p className="eyebrow">Tesouraria</p>
          <h2>Politica de saques Pix</h2>
          <p>O bruto e reservado na carteira; a taxa e descontada e somente o liquido segue ao Asaas.</p>
        </div>
        <span className="settings-main__count">Configuracao global</span>
      </header>

      <form className="withdrawal-settings" onSubmit={onSubmit}>
        <div className="withdrawal-settings__switches">
          <label><input checked={form.enabled} onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" /><span><strong>Saques ativos</strong><small>Permite novas solicitacoes no aplicativo.</small></span></label>
          <label><input checked={form.manualApproval} onChange={(event) => onChange((current) => ({ ...current, manualApproval: event.target.checked }))} type="checkbox" /><span><strong>Aprovacao manual</strong><small>Financeiro revisa antes de enviar ao Asaas.</small></span></label>
        </div>
        <div className="withdrawal-settings__grid">
          {fields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <span className="money-input"><b>R$</b><input min="0" onChange={(event) => onChange((current) => ({ ...current, [field.key]: Math.round(Number(event.target.value || 0) * 100) }))} step="0.01" type="number" value={Number(form[field.key] ?? 0) / 100} /></span>
              <small>{field.note}</small>
            </label>
          ))}
        </div>
        <div className="withdrawal-settings__summary">
          <ShieldCheck size={19} />
          <p>Um saque minimo de <strong>{formatMoney(form.minimumCents)}</strong> entrega <strong>{formatMoney(Math.max(form.minimumCents - form.fixedFeeCents, 0))}</strong> ao titular depois da taxa.</p>
        </div>
        <button className="button button--primary" disabled={isSaving} type="submit"><Save size={17} /> {isSaving ? "Salvando..." : "Salvar politica de saques"}</button>
      </form>
    </section>
  );
}

function EarningsWorkspace({
  draft,
  isSaving,
  onChange,
  onPaymentPolicyChange,
  onPaymentPolicySave,
  onSave,
  onSelectSegment,
  paymentPolicy,
  selectedSegment,
  segments,
}) {
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

      <form className="withdrawal-settings" onSubmit={onPaymentPolicySave}>
        <div className="segment-editor__heading">
          <div className="segment-editor__icon"><WalletCards size={22} /></div>
          <div>
            <p className="eyebrow">Processamento e cashback</p>
            <h3>Politica por canal</h3>
            <p>No online a taxa de servico fica fora da comissao. No local ela sai da retencao antes do cashback e do pool.</p>
          </div>
        </div>
        <div className="withdrawal-settings__grid">
          {paymentPolicyFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <span className="money-input">
                <b>R$</b>
                <input
                  min="0"
                  onChange={(event) => onPaymentPolicyChange((current) => ({
                    ...current,
                    [field.key]: Math.round(Number(event.target.value || 0) * 100),
                  }))}
                  step="0.01"
                  type="number"
                  value={Number(paymentPolicy[field.key] ?? 0) / 100}
                />
              </span>
              <small>{field.note}</small>
            </label>
          ))}
        </div>
        <button className="button button--primary" disabled={isSaving} type="submit">
          <Save size={17} /> {isSaving ? "Salvando..." : "Salvar politica de pagamentos"}
        </button>
      </form>

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

              <div className="segment-editor__heading">
                <div className="segment-editor__icon"><WalletCards size={22} /></div>
                <div>
                  <p className="eyebrow">Excecoes do segmento</p>
                  <h3>Politica de pagamentos</h3>
                  <p>Deixe vazio para herdar o valor global. Uma loja ainda pode ter uma excecao propria acima deste nivel.</p>
                </div>
              </div>

              <div className="withdrawal-settings__grid">
                {paymentPolicyFields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <span className="money-input">
                      <b>R$</b>
                      <input
                        min="0"
                        onChange={(event) => onChange(
                          field.key,
                          event.target.value === ""
                            ? ""
                            : Math.round(Number(event.target.value) * 100),
                        )}
                        placeholder={formatMoney(paymentPolicy[field.key])}
                        step="0.01"
                        type="number"
                        value={draft[field.key] === "" || draft[field.key] == null
                          ? ""
                          : Number(draft[field.key]) / 100}
                      />
                    </span>
                    <small>{field.note} Herdado agora: {formatMoney(paymentPolicy[field.key])}.</small>
                  </label>
                ))}
              </div>

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
          <div className="support-phone-preview__top"><MessageCircle size={18} /> Suporte Brasil Cashback</div>
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
  const overrides = segment.paymentPolicyOverrides ?? {};

  return {
    cashbackPercent: String(segment.commission?.cashbackPercent ?? 0),
    consumerReferralPercent: String(segment.commission?.consumerReferralPercent ?? 0),
    feePercent: String(segment.commission?.feePercent ?? segment.feePercent ?? 0),
    localPriorityCashbackLimitCents: overrides.localPriorityCashbackLimitCents ?? "",
    localProcessingFeeCents: overrides.localProcessingFeeCents ?? "",
    networkPercent: String(segment.commission?.networkPercent ?? 0),
    onlineServiceFeeCents: overrides.onlineServiceFeeCents ?? "",
    sellerReferralPercent: String(segment.commission?.sellerReferralPercent ?? 0),
  };
}

function normalizeCommission(draft) {
  return {
    cashbackPercent: Number(draft.cashbackPercent ?? 0),
    consumerReferralPercent: Number(draft.consumerReferralPercent ?? 0),
    feePercent: Number(draft.feePercent ?? 0),
    localPriorityCashbackLimitCents:
      draft.localPriorityCashbackLimitCents === ""
        ? null
        : Number(draft.localPriorityCashbackLimitCents),
    localProcessingFeeCents:
      draft.localProcessingFeeCents === "" ? null : Number(draft.localProcessingFeeCents),
    networkPercent: Number(draft.networkPercent ?? 0),
    onlineServiceFeeCents:
      draft.onlineServiceFeeCents === "" ? null : Number(draft.onlineServiceFeeCents),
    sellerReferralPercent: Number(draft.sellerReferralPercent ?? 0),
  };
}

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(Number(value ?? 0) / 100);
}
