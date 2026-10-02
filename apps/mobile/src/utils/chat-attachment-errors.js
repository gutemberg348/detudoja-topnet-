export function attachmentPermissionError(resource, permission) {
  return Object.assign(new Error("Permissao nao concedida"), {
    code: "CHAT_PERMISSION_DENIED", resource, canAskAgain: permission?.canAskAgain,
  });
}

export function chatAttachmentNotice(error) {
  if (error?.code === "CHAT_PERMISSION_DENIED") {
    const resource = { location: "à localização", camera: "à câmera", photos: "às fotos", microphone: "ao microfone" }[error.resource] ?? "ao recurso";
    const blocked = error.canAskAgain === false;
    return {
      text: blocked
        ? `Acesso ${resource} desativado. Você pode permitir nos ajustes do celular.`
        : `Sem acesso ${resource}. Você pode continuar no chat e permitir quando quiser.`,
      settings: blocked,
    };
  }
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (/unsatisfied device settings|location.*disabled|location.*unavailable|location.*settings|gps.*desativado/.test(detail)) {
    return { text: "A localização do celular está desligada ou indisponível. Ative o GPS e tente novamente, ou envie o endereço por escrito.", settings: false };
  }
  if (/permission|denied|not authorized|cancelled|canceled/.test(detail)) {
    return { text: "Acesso não autorizado. Você pode continuar no chat ou conferir as permissões nos ajustes.", settings: true };
  }
  return null;
}
