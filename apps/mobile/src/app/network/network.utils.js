export function connectionLabel(person) {
  if (person.connectionType === "DIRETA" || person.placementType === "DIRETO") {
    return "Direto";
  }

  if (person.connectionType === "REDE" || person.placementType === "DERRAMAMENTO") {
    return "Rede";
  }

  return "Raiz";
}

export function isDirectConnection(person) {
  return person.connectionType === "DIRETA" || person.placementType === "DIRETO";
}

export function personInitials(name = "") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 1).toUpperCase())
    .join("");
}

export function formatNetworkDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}
