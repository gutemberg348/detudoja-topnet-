const labels = {
  APROVADO: "Aprovado",
  ATIVA: "Ativa",
  ATIVO: "Ativo",
  BLOQUEADA: "Bloqueada",
  BLOQUEADO: "Bloqueado",
  EM_ANALISE: "Em análise",
  INATIVA: "Inativa",
  INATIVO: "Inativo",
  PAUSADA: "Pausada",
  PENDENTE: "Pendente",
  RASCUNHO: "Rascunho",
  REPROVADA: "Reprovada",
  REPROVADO: "Reprovado",
};

export function StatusBadge({ status }) {
  const tone =
    status === "ATIVO" || status === "ATIVA" || status === "APROVADO"
      ? "success"
      : ["EM_ANALISE", "INATIVA", "INATIVO", "PAUSADA", "PENDENTE", "RASCUNHO"].includes(status)
        ? "warning"
        : "danger";

  return <span className={`status-badge status-badge--${tone}`}>{labels[status] ?? status}</span>;
}
