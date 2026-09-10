import { Check, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageError, PageLoading } from "../components/PageState";
import { StatusBadge } from "../components/StatusBadge";
import {
  approveAdminKyc,
  getAdminKycFile,
  getAdminKycSubmissions,
  rejectAdminKyc,
  revokeAdminKyc,
} from "../services/admin.api";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const warningLabels = {
  BAIXO_CONTRASTE: "Baixo contraste",
  FOTO_CLARA_DEMAIS: "Foto clara demais",
  FOTO_ESCURA: "Foto escura",
  IMAGEM_REUTILIZADA: "Imagem ja usada em outro envio",
};
const manualCheckLabels = {
  AMOSTRA_DE_CALIBRACAO: "Amostra para calibracao",
  APROVACAO_AUTOMATICA_DESABILITADA: "Aprovacao automatica ainda nao foi liberada",
  OCR_COM_BAIXA_CONFIANCA: "OCR com baixa confianca",
  QUALIDADE_DA_IMAGEM: "Qualidade da imagem exige validacao",
  TIPO_DOCUMENTO_NAO_CONFIRMADO: "Tipo de documento nao confirmado pelo OCR",
};

function triageLabel(review) {
  if (review.automaticResult === "APROVADO") return "Aprovado pelo motor";
  if (review.automaticResult === "EM_ANALISE") return "Fila de calibracao";
  if (review.automaticResult === "APTO_PARA_ANALISE") return "Sem alerta tecnico";
  if (review.version >= 2) return "Recusado pelo motor";
  return "Revisar legado";
}

function formatCpf(value = "") {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : value || "Nao informado";
}

function KycFile({ accessToken, file }) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getAdminKycFile(accessToken, file.url)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((requestError) => active && setError(requestError.message));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, file.url]);

  return (
    <figure className="kyc-file">
      <div className="kyc-file__preview">
        {source ? <img alt={file.label} src={source} /> : error ? <span>{error}</span> : <span>Carregando imagem...</span>}
      </div>
      <figcaption>
        <strong>{file.label}</strong>
        <span>{file.width} x {file.height} px</span>
        <small>Iluminacao {file.brightness.toFixed(0)} / contraste {file.contrast.toFixed(0)}</small>
      </figcaption>
    </figure>
  );
}

export function KycPage({ accessToken }) {
  const [data, setData] = useState(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ page: 1, search: "", status: "" });
  const [processing, setProcessing] = useState(false);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getAdminKycSubmissions(accessToken, { ...filters, perPage: 15 }));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar a fila KYC.");
    }
  }, [accessToken, filters]);

  useEffect(() => { load(); }, [load]);

  function applySearch(event) {
    event.preventDefault();
    setFilters((current) => ({ ...current, page: 1, search: draftSearch.trim() }));
  }

  async function decide(action) {
    if (!selected || reason.trim().length < 8) {
      setError("Explique a decisao com pelo menos 8 caracteres.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      const work = action === "approve"
        ? approveAdminKyc
        : action === "revoke"
          ? revokeAdminKyc
          : rejectAdminKyc;
      await work(accessToken, selected.id, reason.trim());
      setSelected(null);
      setReason("");
      await load();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel registrar a decisao.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="page-content kyc-page">
      <header className="page-heading page-heading--actions">
        <div><p className="eyebrow">COMPLIANCE</p><h1>Auditoria KYC</h1><p>Acompanhe as decisoes automaticas de OCR, comparacao facial e prova de vida.</p></div>
        <button className="button button--secondary" onClick={load} type="button"><RefreshCw size={16} /> Atualizar</button>
      </header>

      <section className="toolbar">
        <form className="search-field" onSubmit={applySearch}>
          <Search size={18} />
          <input onChange={(event) => setDraftSearch(event.target.value)} placeholder="Nome, e-mail ou CPF" value={draftSearch} />
          <button aria-label="Buscar" title="Buscar" type="submit"><Search size={18} /></button>
        </form>
        <select aria-label="Filtrar status" onChange={(event) => setFilters((current) => ({ ...current, page: 1, status: event.target.value }))} value={filters.status}>
          <option value="">Todos</option><option value="APROVADO">Aprovados</option><option value="REPROVADO">Reprovados</option><option value="BLOQUEADO">Revogados</option><option value="EM_ANALISE">Em analise e calibracao</option>
        </select>
      </section>

      {data && error ? <div className="inline-error" role="alert">{error}</div> : null}
      {!data && !error ? <PageLoading label="Carregando fila KYC" /> : null}
      {!data && error ? <PageError message={error} onRetry={load} /> : null}
      {data ? (
        <section className="data-section data-section--flush">
          <div className="result-line"><strong>{data.pagination.total}</strong> solicitacoes encontradas</div>
          <div className="table-scroll">
            <table className="kyc-table">
              <thead><tr><th>Participante</th><th>Documento</th><th>Triagem</th><th>Envio</th><th>Status</th><th></th></tr></thead>
              <tbody>{data.submissions.map((item) => (
                <tr key={item.id}>
                  <td><span className="table-primary">{item.user.name}</span><span className="table-secondary">{item.user.email}</span></td>
                  <td><span className="table-primary">{item.documentType}</span><span className="table-secondary">{formatCpf(item.user.cpf)}</span></td>
                  <td><span className="table-primary">{triageLabel(item.automaticReview)}</span><span className="table-secondary">{(item.automaticReview.failures?.length ?? item.automaticReview.warnings?.length ?? 0) + (item.automaticReview.manualChecksRequired?.length ?? 0)} apontamento(s)</span></td>
                  <td>{dateFormatter.format(new Date(item.submittedAt))}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td><button className="icon-button" onClick={() => { setSelected(item); setReason(""); }} title="Analisar documentos" type="button"><Eye size={18} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!data.submissions.length ? <div className="empty-state"><ShieldCheck size={28} /><p>Nenhuma solicitacao nesta fila.</p></div> : null}
          <div className="pagination"><span>Pagina {data.pagination.page} de {data.pagination.pages}</span><div>
            <button className="icon-button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} title="Pagina anterior" type="button"><ChevronLeft size={18} /></button>
            <button className="icon-button" disabled={filters.page >= data.pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} title="Proxima pagina" type="button"><ChevronRight size={18} /></button>
          </div></div>
        </section>
      ) : null}

      {selected ? (
        <div className="modal-backdrop" onMouseDown={() => !processing && setSelected(null)}>
          <section className="modal modal--wide kyc-review" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal__header"><div><p className="eyebrow">SOLICITACAO #{selected.id}</p><h2>{selected.user.name}</h2><p>{selected.user.email} · CPF {formatCpf(selected.user.cpf)}</p></div><button className="icon-button" disabled={processing} onClick={() => setSelected(null)} title="Fechar" type="button"><X size={19} /></button></div>
            <div className="kyc-review__summary"><StatusBadge status={selected.status} /><span>{selected.documentType}</span><span>Enviado em {dateFormatter.format(new Date(selected.submittedAt))}</span></div>
            <div className="kyc-files">{selected.files.map((file) => <KycFile accessToken={accessToken} file={file} key={file.id} />)}</div>
            <section className="kyc-checks">
              <h3>Triagem automatica</h3>
              {selected.automaticReview.warnings?.length ? selected.automaticReview.warnings.map((warning, index) => <span key={`${warning.file}-${warning.warning}-${index}`}>{warningLabels[warning.warning] ?? warning.warning} · {warning.file}</span>) : <span className="kyc-checks__ok"><Check size={15} /> Formato, tamanho, iluminacao e contraste sem alertas</span>}
              {selected.automaticReview.failures?.map((failure) => <span key={failure.code}>{failure.message}</span>)}
              {selected.automaticReview.manualChecksRequired?.map((check) => <span key={check}>{manualCheckLabels[check] ?? check}</span>)}
              {selected.automaticReview.metrics ? <p>OCR {selected.automaticReview.metrics.ocrConfidence}% · nome {Math.round(selected.automaticReview.metrics.nameMatch * 100)}% · rosto {Math.round(selected.automaticReview.metrics.faceMatch * 100)}% · real {Math.round(selected.automaticReview.metrics.selfieReal * 100)}% · vida {Math.round(selected.automaticReview.metrics.selfieLive * 100)}%</p> : <p>Registro legado criado antes da verificacao facial automatica.</p>}
            </section>
            {selected.status === "EM_ANALISE" ? <>
              <label className="kyc-reason">Justificativa da decisao<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Registre o que foi conferido ou o motivo da recusa" rows={3} value={reason} /></label>
              <div className="modal__actions"><button className="button button--danger" disabled={processing} onClick={() => decide("reject")} type="button"><X size={16} /> Reprovar</button><button className="button button--primary" disabled={processing} onClick={() => decide("approve")} type="button"><Check size={16} /> Aprovar KYC</button></div>
            </> : <div className="kyc-decision"><strong>Decisao registrada</strong><p>{selected.decisionReason}</p><small>{selected.analyzedBy?.name ?? (selected.automaticReview.version >= 2 ? "Motor automatico" : "Administrador")} · {selected.analyzedAt ? dateFormatter.format(new Date(selected.analyzedAt)) : "-"}</small></div>}
            {selected.status === "APROVADO" ? <>
              <label className="kyc-reason">Motivo da revogacao<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o incidente que exige o bloqueio" rows={3} value={reason} /></label>
              <div className="modal__actions"><button className="button button--danger" disabled={processing} onClick={() => decide("revoke")} type="button"><X size={16} /> Revogar e bloquear</button></div>
            </> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
